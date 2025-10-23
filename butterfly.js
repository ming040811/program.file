// butterfly.js (FINAL CODE - CPU 모드 적용)

// MediaPipe 객체를 명시적으로 import합니다.
import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

let handLandmarker = undefined;
let video = null;
let canvas = null;
let currentButterfly = null; 
let animationFrameId = null; 
let trackingData = null; 

// --- 초기화 함수 ---
const createHandLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, { 
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            // 🌟🌟🌟 해결책: GPU 대신 CPU를 사용하여 호환성 문제를 해결합니다 🌟🌟🌟
            delegate: "CPU" 
        },
        runningMode: "VIDEO",
        numHands: 1
    });
    console.log("Butterfly Tracker: HandLandmarker loaded.");
};

createHandLandmarker();

// --- 추적 시작/중지 함수 ---
export function startTracking(videoElement, sceneData, butterfly) {
    if (!handLandmarker) {
        console.warn("HandLandmarker not yet loaded.");
        return;
    }
    
    video = videoElement;
    canvas = document.getElementById('canvas');
    trackingData = sceneData; 
    currentButterfly = butterfly;

    if (!video.srcObject) {
        video.onloadeddata = () => {
            if (currentButterfly) startTracking(videoElement, sceneData, butterfly);
        };
        return;
    }
    
    stopTracking(); 
    video.play();
    console.log("Butterfly Tracker: Tracking started.");
    
    let lastVideoTime = -1;
    function predict() {
        if (video.currentTime !== lastVideoTime) {
            handLandmarker.detectForVideo(video, video.currentTime, (result) => {
                lastVideoTime = video.currentTime;
                processLandmarks(result);
            });
        }
        animationFrameId = window.requestAnimationFrame(predict);
    }
    
    predict();
}

export function stopTracking() {
    if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    console.log("Butterfly Tracker: Tracking stopped.");
}

// --- 랜드마크 처리 함수 (나비 위치 및 회전 계산) ---
function processLandmarks(result) {
    if (!currentButterfly || !canvas) return;

    if (result.handednesses.length > 0) {
        const landmarks = result.landmarks[0];
        const pointer = landmarks[8]; // 검지 손가락 끝
        
        // 1. 캔버스 크기
        const canvasWidth = canvas.offsetWidth;
        const canvasHeight = canvas.offsetHeight;
        
        // 2. 좌표 변환 (0.0~1.0 -> 캔버스 픽셀)
        const normalizedX = 1.0 - pointer.x; // 미러링
        
        let newX = normalizedX * canvasWidth; 
        let newY = pointer.y * canvasHeight;
        
        // 3. 나비 위치 업데이트
        currentButterfly.data.x = newX;
        currentButterfly.data.y = newY;
        currentButterfly.element.style.left = `${newX}px`;
        currentButterfly.element.style.top = `${newY}px`;

        // 4. 회전 각도 계산
        const wrist = landmarks[0];
        const invertedWristX = 1.0 - wrist.x;
        const invertedIndexX = 1.0 - pointer.x;

        let handAngle = Math.atan2(wrist.y - pointer.y, invertedWristX - invertedIndexX) * (180 / Math.PI);
        
        let correctedAngle = handAngle - 90; 
        if (correctedAngle > 90) correctedAngle -= 180;
        else if (correctedAngle < -90) correctedAngle += 180;
        
        const finalRotation = Math.max(-20, Math.min(20, -correctedAngle)); // 좌우 20도 제한
        
        // translate(-50%, -50%)를 항상 앞에 두어 중앙을 기준으로 위치 조정 후 회전합니다.
        currentButterfly.element.style.transform = `translate(-50%, -50%) rotate(${finalRotation}deg)`;
        currentButterfly.data.rotation = finalRotation;
    }
}

export function updateCurrentSceneData(data) {
    trackingData = data;
}