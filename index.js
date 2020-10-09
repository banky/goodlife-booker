const axios = require("axios");
const FormData = require("form-data");
const dayjs = require("dayjs");
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Nothing to see here...");
});

var server = app.listen(process.env.PORT || 5000, () => {
  var host = server.address().address;
  var port = server.address().port;

  console.log("App listening at http://%s:%s", host, port);
});

const CLUB_ID = 268; // Richmond and John location
const daysOfWeekToBook = [1, 2, 4, 5];
let timeout = undefined;
let retries = 5;

const login = async (username, password) => {
  const formData = new FormData();
  formData.append("Login", username);
  formData.append("Password", password);

  const loginResponse = await axios.post(
    "https://www.goodlifefitness.com/memberauth/authenticate",
    formData,
    {
      headers: formData.getHeaders(),
    }
  );

  const cookies = loginResponse.headers["set-cookie"];
  const formattedCookie = cookies.reduce((acc, curr) => {
    // +2 to include the semicolon and space
    const cookieValue = curr.substr(0, curr.indexOf(";") + 2);
    return acc + cookieValue;
  }, "");

  return formattedCookie;
};

const getBookingSlots = async (day, clubId, cookie) => {
  const response = await axios.get(
    `https://www.goodlifefitness.com/club-occupancy/club-workout-schedule?club=${clubId}&day=${day.format(
      "YYYY-MM-DD"
    )}&studio=Gym%20Floor`,
    {
      headers: {
        cookie: cookie,
      },
    }
  );

  if (response.data.length === 0) {
    return Promise.reject("No slots available today");
  }

  const bookingSlots = Object.values(response.data).reduce((acc, curr) => {
    return [...acc, ...curr];
  }, []);

  return bookingSlots;
};

const makeBooking = async (clubId, timeslotId, cookie) => {
  const bookingFormData = new FormData();
  bookingFormData.append("ClubId", clubId);
  bookingFormData.append("TimeSlotId", timeslotId);

  const bookingResponse = await axios.post(
    "https://www.goodlifefitness.com/club-occupancy/book",
    bookingFormData,
    {
      headers: {
        ...bookingFormData.getHeaders(),
        cookie: cookie,
      },
    }
  );

  return bookingResponse.data;
};

// Get a time early tomorrow to try
const getNextTimeToTry = () => {
  const nextTimeToTry = dayjs().startOf("day").add(30, "second").add(1, "day");
  return nextTimeToTry.valueOf() - dayjs().valueOf();
};

const main = async () => {
  if (timeout !== undefined) clearTimeout(timeout);

  const today = dayjs().day();
  const shouldBookToday = daysOfWeekToBook.some(
    (dayOfWeekToBook) => dayOfWeekToBook === today
  );
  if (!shouldBookToday) {
    console.log(
      `Not running today (${dayjs().format("YYYY-MM-DD")}), will try tomorrow`
    );
    timeout = setTimeout(main, getNextTimeToTry());
    return;
  }

  try {
    const cookie = await login(
      process.env.BANKY_USERNAME,
      process.env.BANKY_PASSWORD
    );

    const nextWeek = dayjs().add(7, "day");
    const bookingSlots = await getBookingSlots(nextWeek, CLUB_ID, cookie);

    const targetBookingSlots = bookingSlots.filter(
      (booking) => booking.StartAtDisplay === "7:30AM"
    );

    if (targetBookingSlots.length === 0) {
      throw new Error("No slot available at the specified time");
    }

    const timeslotId = targetBookingSlots[0].Id;
    await makeBooking(CLUB_ID, timeslotId, cookie);

    timeout = setTimeout(main, getNextTimeToTry());
  } catch (error) {
    if (error.response) {
      console.log("error: ", error.response.data);
    } else {
      console.log("error: ", error);
    }

    if (retries > 0) {
      retries = retries - 1;
      const retryTime = 1000 * 60 * 1;
      console.log("Trying again in one minute. Retries: ", retries);
      timeout = setTimeout(main, retryTime);
      return;
    }
    retries = 5;
    console.log("Trying again tomorrow");
    timeout = setTimeout(main, getNextTimeToTry());
  }
};

main();

// Hit app every 5 minutes to keep heroku dyno alive
setInterval(() => {
  axios
    .get("https://goodlife-booker.herokuapp.com")
    .then(() => console.log("Keeping dyno alive"));
}, 1000 * 60 * 5);
