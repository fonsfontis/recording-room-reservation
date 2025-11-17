require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ---------------------------
// MongoDB 연결
// ---------------------------
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("MongoDB 연결 성공"))
.catch(err => console.error("MongoDB 연결 실패:", err));

// ---------------------------
// 예약 모델
// ---------------------------
const Reservation = mongoose.model('Reservation', {
    name: String,
    date: String,
    startTime: Number,
    endTime: Number
});

// ---------------------------
// 미들웨어
// ---------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------
// 정적 파일 제공
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// ---------------------------
// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ---------------------------
// 예약 API
app.get('/api/reservations', async (req, res) => {
    try {
        const reservations = await Reservation.find();
        res.json(reservations);
    } catch (err) {
        res.status(500).send("예약 정보를 가져오는 중 오류 발생");
    }
});

app.post('/api/reservations', async (req, res) => {
    try {
        const { name, date, startTime, endTime } = req.body;
        const duration = endTime - startTime;

        // 하루 최대 2시간
        const dayReservations = await Reservation.aggregate([
            { $match: { date } },
            { $group: { _id: "$name", total: { $sum: { $subtract: ["$endTime", "$startTime"] } } } }
        ]);
        const today = dayReservations.find(r => r._id === name);
        if (today && today.total + duration > 2)
            return res.status(400).send("하루 최대 2시간까지 예약 가능합니다.");

        // 주간 최대 6시간
        const dayObj = new Date(date);
        const weekStart = new Date(dayObj);
        weekStart.setDate(dayObj.getDate() - dayObj.getDay() + (dayObj.getDay() === 0 ? -6 : 1));
        weekStart.setHours(0,0,0,0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const weekReservations = await Reservation.aggregate([
            {
                $match: {
                    name,
                    date: { 
                        $gte: weekStart.toISOString().split('T')[0],
                        $lte: weekEnd.toISOString().split('T')[0]
                    }
                }
            },
            { $group: { _id: "$name", total: { $sum: { $subtract: ["$endTime", "$startTime"] } } } }
        ]);

        if (weekReservations.length && weekReservations[0].total + duration > 6)
            return res.status(400).send("일주일 최대 6시간까지 예약 가능합니다.");

        // 시간 겹침 확인
        const conflict = await Reservation.findOne({
            date,
            $or: [
                { startTime: { $lt: endTime, $gte: startTime } },
                { endTime: { $gt: startTime, $lte: endTime } },
                { startTime: { $lte: startTime }, endTime: { $gte: endTime } }
            ]
        });
        if (conflict) return res.status(400).send("이미 예약된 시간이 있습니다.");

        const newReservation = new Reservation({ name, date, startTime, endTime });
        await newReservation.save();

        io.emit('updateReservations', newReservation);
        res.status(201).json(newReservation);

    } catch (err) {
        console.error(err);
        res.status(500).send("예약 중 오류 발생");
    }
});

app.delete('/api/reservations/:id', async (req, res) => {
    try {
        const result = await Reservation.findByIdAndDelete(req.params.id);
        if (!result) return res.status(404).json({ message: "예약을 찾을 수 없습니다." });

        io.emit('updateReservations', { deletedId: req.params.id });
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: "예약 취소 중 오류 발생" });
    }
});

// ---------------------------
// Socket.io
io.on('connection', (socket) => {
    console.log('사용자가 연결되었습니다.');
    socket.on('disconnect', () => console.log('사용자가 연결을 종료했습니다.'));
});

// ---------------------------
// 서버 실행
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`서버가 ${PORT} 포트에서 실행 중입니다.`));
