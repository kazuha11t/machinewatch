# Upwork portfolio kit: MachineWatch

Nội dung tiếng Anh bên dưới dán thẳng vào Upwork được. Phần tiếng Việt chỉ là ghi chú cho bạn.

---

## 1. Portfolio project (Profile → Portfolio → Add)

**Project title** (≤ 70 ký tự)

> IoT Predictive Maintenance Platform: ESP32, MQTT, Node.js, React & AI

**Your role**

> Full-stack & IoT developer (solo: firmware, backend, AI, web, mobile)

**Project description**

> MachineWatch monitors industrial machines in real time and predicts failures before they stop a production line.
>
> • ESP32 firmware reads temperature, vibration (MPU6050) and motor current (ACS712), publishes over MQTT and controls a relay remotely
> • Node.js/TypeScript backend ingests MQTT data, evaluates alert rules, stores time series and streams live updates over WebSocket
> • Python AI service (FastAPI + scikit-learn) learns each machine's normal behaviour, scores anomalies, computes a 0–100 health score and forecasts when vibration will cross the ISO 10816 limit
> • React dashboard with live charts, alert management and CSV export; React Native (Expo) app with push notifications
> • Docker Compose deployment, automated tests and GitHub Actions CI
>
> Result: in the demo scenario the AI flags a failing bearing before the fixed 4.5 mm/s warning rule fires, giving maintenance time to act.

**Skills to tag** (tối đa theo Upwork cho phép)

> Internet of Things · ESP32 · MQTT · Node.js · React · React Native · Python · Machine Learning · TypeScript · Embedded C

**Media** (theo thứ tự)

1. `docs/screenshots/02-overview.png`: ảnh bìa
2. `docs/screenshots/03-device-detail.png`
3. `docs/screenshots/04-alerts.png`
4. Video 60–90 s quay ESP32 thật + dashboard (xem mục 3)
5. Link GitHub repo

---

## 2. Proposal snippets

Chỉnh câu đầu cho khớp job. Luôn nhắc đúng vấn đề của khách trước, dự án sau.

**Job IoT / ESP32 / MQTT dashboard**

> Hi [Name], I recently built an end-to-end system very close to what you describe: ESP32 nodes publishing sensor data over MQTT to a Node.js backend, with a live React dashboard, alert rules and remote relay control. Repo and screenshots: [GitHub link].
>
> For your project I would [1–2 concrete steps tied to their requirements]. I can start with [a small first milestone] so you can see the data flowing within the first days.

**Job Full-stack React / Node.js**

> Hi [Name], my most recent project is a real-time monitoring platform built with React 19 + TypeScript on the front end and Node.js/Express + Socket.IO on the back end (JWT auth, REST API, WebSocket streaming, tested with node:test, CI on GitHub Actions): [GitHub link]. [Tie to their app in one sentence.]

**Job React Native**

> Hi [Name], I built the companion mobile app for my IoT platform with Expo and React Native: live data over WebSocket, secure token storage and push notifications for critical alerts: [GitHub link]. [Tie to their app in one sentence.]

**Job AI / anomaly detection / data**

> Hi [Name], in my latest project I implemented per-device anomaly detection with scikit-learn (Isolation Forest) behind a FastAPI service, plus a trend model that forecasts when a machine will cross a safety limit: [GitHub link]. [Tie to their data in one sentence.]

---

## 3. Kịch bản quay video demo (60–90 s)

1. (0–10 s) Cầm mạch ESP32 + cảm biến trước camera, mở Serial Monitor thấy `[mqtt] connected`.
2. (10–25 s) Dashboard: thiết bị tự xuất hiện, số liệu nhảy trực tiếp.
3. (25–45 s) Rung/lắc mạch (MPU6050): biểu đồ vibration tăng, cảnh báo hiện trên web.
4. (45–60 s) Bấm **Stop machine**: relay trên mạch kêu "tách", trạng thái đổi sang Stopped.
5. (60–90 s) Chuyển sang máy giả lập Air Compressor #2: AI health tụt, dòng "Vibration limit in ~X min", thông báo trên điện thoại.

Quay màn hình bằng OBS hoặc Xbox Game Bar (Win + G), thêm chữ tiếng Anh ngắn cho từng đoạn.

---

## 4. Gợi ý sửa hồ sơ Upwork

- **Title:** `IoT & Full-Stack Developer | ESP32, MQTT, React, Node.js, React Native`
  (đưa IoT lên đầu: ít đối thủ hơn "Full Stack").
- **Đoạn đầu overview:** khách chỉ thấy khoảng 2 dòng đầu, nên nêu kết quả luôn:
  `I build connected products end to end: ESP32 firmware, MQTT, cloud backend, dashboards and mobile apps. See MachineWatch in my portfolio: sensors → AI anomaly detection → live React dashboard.`
- **English: Basic** làm giảm tỉ lệ được mời. Nếu thực tế bạn đọc/viết tốt hơn mức "basic", cân nhắc đổi thành Conversational cho đúng năng lực.
- **Rate $18/h:** hợp lý để có job đầu; sau 3–5 review tốt thì tăng.
