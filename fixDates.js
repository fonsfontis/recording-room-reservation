require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const Reservation = mongoose.model('Reservation', {
  name: String,
  date: String,
  startTime: Number,
  endTime: Number
});

async function fixDates() {
  const reservations = await Reservation.find();
  for (let res of reservations) {
    const [y, m, d] = res.date.split('-').map(Number);
    const fixedDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (res.date !== fixedDate) {
      res.date = fixedDate;
      await res.save();
      console.log(`Updated: ${res._id} -> ${fixedDate}`);
    }
  }
  console.log("✅ 모든 예약 날짜 보정 완료");
  mongoose.disconnect();
}

fixDates().catch(console.error);
