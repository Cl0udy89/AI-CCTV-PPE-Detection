# AI CCTV PPE Detection

## Quick Start

### 1. Install backend dependencies (once)
```bash
cd backend
pip install -r requirements.txt
```

### 2. Install frontend dependencies (once)
```bash
cd frontend
npm install
```

### 3. Start both servers
```bat
start.bat
```
Or manually:
```bash
# Terminal 1
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd frontend && npm run dev
```

Open http://localhost:3000

---

## Chapter 1 Features
- OBS Virtual Camera (webcam device 0/1/2)
- RTSP stream support
- Real-time YOLO PPE detection
- Toggle detection classes live with checkboxes
