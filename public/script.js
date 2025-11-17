// 🔧 DOM 요소
const socket = io({ path: '/socket.io' });

socket.on("updateReservations", () => getReservationsFromServer());

const resNameInput = document.getElementById("res-name");
const resDaySelect = document.getElementById("res-day");
const resStartTimeSelect = document.getElementById("res-start-time");
const resEndTimeSelect = document.getElementById("res-end-time");
const submitBtn = document.getElementById("submit-res");
const reservationMessage = document.getElementById("reservation-message");
const gridBody = document.getElementById("grid-body");
const timeHeader = document.getElementById("time-header");
const currentWeekDisplay = document.getElementById("current-week-display");
const prevWeekBtn = document.getElementById("prev-week-btn");
const nextWeekBtn = document.getElementById("next-week-btn");
const modal = document.getElementById("modal");
const modalText = document.getElementById("modal-text");
const closeBtn = document.querySelector(".close-button");
const cancelResBtn = document.getElementById("cancel-res-btn");

let reservations = {};
let selectedCell = null;

// ---------------------------
// ⏰ 시간/요일 설정
const hours = Array.from({ length: 18 }, (_, i) => i + 6);
const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

// ---------------------------
// 📅 이번 주 월요일 계산
let currentWeekStart = new Date();
let day = currentWeekStart.getDay();
currentWeekStart.setDate(currentWeekStart.getDate() - (day === 0 ? 6 : day - 1));
currentWeekStart.setHours(0,0,0,0);

// ---------------------------
// 📋 select 초기화
function populateSelects() {
    resDaySelect.innerHTML = "";
    for (let i=0;i<7;i++){
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate()+i);
        const option = document.createElement("option");
        option.value = i;
        option.textContent = `${weekdays[i]} (${date.getMonth()+1}/${date.getDate()})`;
        resDaySelect.appendChild(option);
    }
    resStartTimeSelect.innerHTML = "";
    resEndTimeSelect.innerHTML = "";
    hours.forEach(h=>{
        let option1 = document.createElement("option");
        option1.value = h;
        option1.textContent = `${h}:00`;
        resStartTimeSelect.appendChild(option1);
        let option2 = document.createElement("option");
        option2.value = h+1;
        option2.textContent = `${h+1}:00`;
        resEndTimeSelect.appendChild(option2);
    });
}

// ---------------------------
// 🧩 그리드 렌더링
function renderGrid() {
    timeHeader.innerHTML = "<th>시간/요일</th>";
    for(let i=0;i<7;i++){
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate()+i);
        const th = document.createElement("th");
        th.textContent = `${weekdays[i]} (${date.getMonth()+1}/${date.getDate()})`;
        timeHeader.appendChild(th);
    }

    gridBody.innerHTML = "";
    for(let h of hours){
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = `${h}:00`;
        tr.appendChild(th);

        for(let i=0;i<7;i++){
            const td = document.createElement("td");
            const date = new Date(currentWeekStart);
            date.setDate(date.getDate()+i);

            const year = date.getFullYear();
            const month = String(date.getMonth()+1).padStart(2,'0');
            const day = String(date.getDate()).padStart(2,'0');
            const key = `${year}-${month}-${day}-${h}`;
            td.dataset.key = key;

            const now = new Date();
            if(date < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ||
               (date.toDateString()===now.toDateString() && h<=now.getHours())){
                td.classList.add("past-time");
            }

            if(reservations[key]){
                td.classList.add("reserved");
                td.textContent = reservations[key].name;
                td.dataset.reservationId = reservations[key]._id;
            } else td.textContent = "";

            td.addEventListener("click", ()=>openModal(td));
            tr.appendChild(td);
        }
        gridBody.appendChild(tr);
    }

    const endDate = new Date(currentWeekStart);
    endDate.setDate(endDate.getDate()+6);
    currentWeekDisplay.textContent = `${currentWeekStart.getMonth()+1}/${currentWeekStart.getDate()} ~ ${endDate.getMonth()+1}/${endDate.getDate()}`;
}

// ---------------------------
// ✍️ 예약 신청
submitBtn.addEventListener("click", async ()=>{
    const name = resNameInput.value.trim();
    const dayIndex = parseInt(resDaySelect.value);
    const startHour = parseInt(resStartTimeSelect.value);
    const endHour = parseInt(resEndTimeSelect.value);

    if(!name){ reservationMessage.textContent="예약자 이름을 입력하세요."; return; }
    if(startHour>=endHour){ reservationMessage.textContent="종료시간은 시작시간보다 늦어야 합니다."; return; }

    const date = new Date(currentWeekStart);
    date.setDate(date.getDate()+dayIndex);
    const year = date.getFullYear();
    const month = String(date.getMonth()+1).padStart(2,'0');
    const day = String(date.getDate()).padStart(2,'0');
    const dateString = `${year}-${month}-${day}`;

    await submitReservation(name,dateString,startHour,endHour);
});

// ---------------------------
// 🗑️ 모달
function openModal(cell){
    const key = cell.dataset.key;
    if(!reservations[key]) return;
    selectedCell = cell;
    modalText.textContent = `${reservations[key].name}님의 예약을 취소하시겠습니까?`;
    cancelResBtn.dataset.reservationId = cell.dataset.reservationId;
    modal.style.display = "block";
}
closeBtn.addEventListener("click", ()=>modal.style.display="none");
cancelResBtn.addEventListener("click", async ()=>{
    const reservationId = cancelResBtn.dataset.reservationId;
    if(!reservationId) return;
    await cancelReservation(reservationId);
    modal.style.display="none";
});

// ---------------------------
// ⏪⏩ 주 이동
prevWeekBtn.addEventListener("click", ()=>{
    currentWeekStart.setDate(currentWeekStart.getDate()-7);
    populateSelects();
    getReservationsFromServer();
});
nextWeekBtn.addEventListener("click", ()=>{
    currentWeekStart.setDate(currentWeekStart.getDate()+7);
    populateSelects();
    getReservationsFromServer();
});

// ---------------------------
// 🌐 서버 통신
async function getReservationsFromServer(){
    try{
        const response = await fetch('/api/reservations',{credentials:'include'});
        if(!response.ok) throw new Error(`서버 응답 실패 ${response.status}`);

        const reservationsArray = await response.json();
        const newReservationsObject = {};
        reservationsArray.forEach(res=>{
            const dateObj = new Date(res.date);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth()+1).padStart(2,'0');
            const day = String(dateObj.getDate()).padStart(2,'0');
            const start = parseInt(res.startTime);
            const end = parseInt(res.endTime);
            for(let h=start;h<end;h++){
                const key = `${year}-${month}-${day}-${h}`;
                newReservationsObject[key]={name:res.name,_id:res._id};
            }
        });
        reservations=newReservationsObject;
        renderGrid();
    }catch(err){
        console.warn("서버 요청 실패:",err);
        reservations={};
        renderGrid();
    }
}

// ---------------------------
// 🚀 예약 등록
async function submitReservation(name,dateString,startHour,endHour){
    try{
        const response = await fetch('/api/reservations',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({name,date:dateString,startTime:startHour,endTime:endHour}),
            credentials:'include'
        });
        if(!response.ok){
            const text = await response.text();
            throw new Error(text || "예약 실패");
        }
        reservationMessage.textContent="✅ 예약이 완료되었습니다.";
        resNameInput.value="";
        await getReservationsFromServer();
    }catch(err){
        reservationMessage.textContent=`❌ ${err.message}`;
    }
}

// ---------------------------
// ❌ 예약 취소
async function cancelReservation(reservationId){
    try{
        const response = await fetch(`/api/reservations/${reservationId}`,{
            method:'DELETE',
            credentials:'include'
        });
        if(!response.ok) throw new Error("예약 취소 실패");
        reservationMessage.textContent="🗑️ 예약이 취소되었습니다.";
        await getReservationsFromServer();
    }catch(err){
        reservationMessage.textContent="❌ 서버 오류로 예약 취소 실패";
    }
}

// ---------------------------
// 🏁 초기화
populateSelects();
getReservationsFromServer();
