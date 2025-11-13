require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MongoDB 연결
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("MongoDB 연결 성공"))
  .catch(err => console.error("MongoDB 연결 실패:", err));

// 예약 모델
const Reservation = mongoose.model('Reservation', {
    name: String,
    date: String,       // YYYY-MM-DD
    startTime: Number,  // 6~23
    endTime: Number
});

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname + '/public')); // public 폴더 정적 제공

// ----------------- 예약 API -----------------

// 예약 조회
app.get('/api/reservations', async (req, res) => {
    try {
        const reservations = await Reservation.find();
        res.json(reservations);
    } catch (err) {
        res.status(500).send("예약 정보를 가져오는 중 오류 발생");
    }
});

// 이름 유효성 검사 함수
const isValidName = (name) => {
    return typeof name === 'string' && /^[가-힣a-zA-Z0-9\s]{1,20}$/.test(name.trim());
};

// 예약 추가
app.post('/api/reservations', async (req, res) => {
    try {
        const { name, date, startTime, endTime } = req.body;

        // 필수값 체크
        if (!name || !date || typeof startTime !== 'number' || typeof endTime !== 'number') {
            return res.status(400).send("모든 필드를 올바르게 입력하세요.");
        }

        // 이름 유효성 검사
        if (!isValidName(name)) {
            return res.status(400).send("이름 형식이 올바르지 않습니다. (한글/영문/숫자 1~20자)");
        }

        // 날짜 형식 검사 및 과거 날짜 차단
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);

        if (isNaN(targetDate.getTime())) {
            return res.status(400).send("유효하지 않은 날짜입니다.");
        }

        if (targetDate < today) {
            return res.status(400).send("지난 날짜에는 예약할 수 없습니다.");
        }

        // 시간 범위 검사
        if (startTime < 6 || endTime > 24 || endTime <= startTime) {
            return res.status(400).send("유효한 시간 범위를 선택하세요. (6~24시 사이)");
        }

        const duration = endTime - startTime;

        // 하루 최대 2시간 제한
        const dayReservations = await Reservation.aggregate([
            { $match: { date } },
            { $group: { _id: "$name", total: { $sum: { $subtract: ["$endTime", "$startTime"] } } } }
        ]);

        const todayUsage = dayReservations.find(r => r._id === name);
        if (todayUsage && todayUsage.total + duration > 2) {
            return res.status(400).send("하루 최대 2시간까지 예약 가능합니다.");
        }

        // 주간 최대 6시간 제한
        const dayObj = new Date(date);
        const weekStart = new Date(dayObj);
        weekStart.setDate(dayObj.getDate() - dayObj.getDay() + 1); // 월요일
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // 일요일

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

        if (weekReservations.length && weekReservations[0].total + duration > 6) {
            return res.status(400).send("일주일 최대 6시간까지 예약 가능합니다.");
        }

        // 시간 겹침 확인
        const conflict = await Reservation.findOne({
            date,
            $or: [
                { startTime: { $lt: endTime, $gte: startTime } },
                { endTime: { $gt: startTime, $lte: endTime } },
                { startTime: { $lte: startTime }, endTime: { $gte: endTime } }
            ]
        });

        if (conflict) {
            return res.status(400).send("이미 예약된 시간이 있습니다.");
        }

        // 예약 저장
        const newReservation = new Reservation({ name, date, startTime, endTime });
        await newReservation.save();

        io.emit('updateReservations', newReservation);
        res.status(201).json(newReservation);

    } catch (err) {
        console.error(err);
        res.status(500).send("예약 중 오류 발생");
    }
});

// 예약 취소
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

// ----------------- Socket.io -----------------
io.on('connection', (socket) => {
    console.log('사용자가 연결되었습니다.');

    socket.on('disconnect', () => {
        console.log('사용자가 연결을 종료했습니다.');
    });
});

// ----------------- 서버 실행 -----------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 ${PORT} 포트에서 실행 중입니다.`);
});
