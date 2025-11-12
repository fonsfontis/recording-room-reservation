require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log("✅ MongoDB 연결 성공");
    mongoose.disconnect(); // 연결 테스트 후 종료
  })
  .catch(err => {
    console.error("❌ MongoDB 연결 실패:", err);
  });
