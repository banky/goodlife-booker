const axios = require("axios");
const FormData = require("form-data");
const dayjs = require("dayjs");

const username = process.env.BANKY_USERNAME;
const password = process.env.BANKY_PASSWORD;

const CLUB_ID = 268; // Richmond and John location
const daysOfWeekToBook = [1, 2, 4, 5];
let timeout = undefined;

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
    const formData = new FormData();
    formData.append("Login", username);
    formData.append("Password", password);

    // Login
    const loginResponse = await axios.post(
      "https://www.goodlifefitness.com/memberauth/authenticate",
      formData,
      {
        headers: formData.getHeaders(),
      }
    );

    const cookies = loginResponse.headers["set-cookie"];
    const formattedCookie = cookies.reduce((acc, curr) => {
      const cookieValue = curr.substr(0, curr.indexOf(";") + 2); // +2 to include the semicolon and space
      return acc + cookieValue;
    }, "");

    console.log("Logged in successfully");

    const nextWeek = dayjs().add(7, "day");

    // Get bookings
    const response = await axios.get(
      `https://www.goodlifefitness.com/club-occupancy/club-workout-schedule?club=268&day=${nextWeek.format(
        "YYYY-MM-DD"
      )}&studio=Gym%20Floor`,
      {
        headers: {
          cookie: formattedCookie,
        },
      }
    );

    const targetBooking = response.data.MorningList.filter(
      (booking) => booking.StartAtDisplay === "7:30AM"
    )[0];

    const bookingFormData = new FormData();
    bookingFormData.append("ClubId", CLUB_ID);
    bookingFormData.append("TimeSlotId", targetBooking.Id);

    const bookingResponse = await axios.post(
      "https://www.goodlifefitness.com/club-occupancy/book",
      bookingFormData,
      {
        headers: {
          ...bookingFormData.getHeaders(),
          cookie: formattedCookie,
        },
      }
    );

    console.log("bookingResponse: ", bookingResponse.data);

    timeout = setTimeout(main, getNextTimeToTry());
  } catch (error) {
    console.log("error: ", error.response.data);
    const fiveMinutes = 1000 * 60 * 5;

    timeout = setTimeout(main, fiveMinutes);
  }
};

main();
