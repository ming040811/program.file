import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

const video = document.getElementById("live-view");
const butterfly = document.getElementById("butterfly");
const videoContainer = document.getElementById("video-container");

let handLandmarker;
let lastRotation = 0;

// 웹캠 스트림 로드 및 추적 시작
navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
    video.srcObject = stream;
    video.onloadeddata = () => {
        // 비디오가 로드되면 추적 시작
        video.style.display = 'block'; // 비디오를 보이게 설정 (opacity는 낮춰둠)
        predictWebcam(); 
    };
}).catch(err => {
    console.error("Error accessing webcam: ", err);
});

// HandLandmarker 초기화
const createHandLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
    });
};
createHandLandmarker();

// 추적 루프
async function predictWebcam() {
    if (!handLandmarker) {
        requestAnimationFrame(predictWebcam);
        return;
    }

    const predictions = handLandmarker.detectForVideo(video, performance.now());

    if (predictions.landmarks.length > 0) {
        const wrist = predictions.landmarks[0][0]; // 손목
        const indexFingerTip = predictions.landmarks[0][8]; // 검지손가락 끝

        // 🌟🌟🌟 핵심 수정: 랜드마크 좌표를 'videoContainer' 픽셀 좌표로 변환 🌟🌟🌟
        const videoRect = videoContainer.getBoundingClientRect(); // 나비가 움직일 컨테이너 크기
        
        // Mediapipe 좌표는 정규화(0.0~1.0)되어 있으므로, 
        // 컨테이너 크기에 맞춰 픽셀 단위로 변환합니다.
        // 좌우 반전 처리를 위해 x 좌표를 1.0에서 는 것은 유지합니다.
        const mirroredX = 1.0 - indexFingerTip.x;
        
        // 최종 픽셀 위치
        const x = mirroredX * videoRect.width; 
        const y = indexFingerTip.y * videoRect.height;
        
        // 나비 위치 계산 (경계 제한은 컨테이너 크기를 사용)
        const butterflyWidth = butterfly.offsetWidth;
        const butterflyHeight = butterfly.offsetHeight;
        
        // 나비가 컨테이너 경계를 넘지 않도록 위치 제한
        const newX = Math.max(butterflyWidth / 2, Math.min(videoRect.width - butterflyWidth / 2, x));
        const newY = Math.max(butterflyHeight / 2, Math.min(videoRect.height - butterflyHeight / 2, y));

        // 회전 각도 계산 (손목(0번)과 손가락 끝(8번)의 좌표를 이용)
        // Mediapipe 좌표는 좌우 반전 상태이므로, x 좌표를 반전하여 각도 계산
        const invertedWristX = 1.0 - wrist.x;
        const invertedIndexX = 1.0 - indexFingerTip.x;
        
        const handAngle = Math.atan2(wrist.y - indexFingerTip.y, invertedWristX - invertedIndexX) * (180 / Math.PI);

        // 회전 각도 보정 및 제한 로직 (이전 코드 유지)
        let correctedAngle = handAngle - 90; 
        
        if (correctedAngle > 90) correctedAngle -= 180;
        else if (correctedAngle < -90) correctedAngle += 180;

        const finalRotation = Math.max(-20, Math.min(20, -correctedAngle));

        // 부드러운 회전 효과
        const smoothedRotation = lastRotation * 0.7 + finalRotation * 0.3;

        // DOM 업데이트
        butterfly.style.left = `${newX}px`;
        butterfly.style.top = `${newY}px`;
        butterfly.style.transform = `translate(-50%, -50%) rotate(${smoothedRotation}deg)`;

        lastRotation = smoothedRotation;

    } else {
        // 손이 감지되지 않을 때
        butterfly.style.transform = `translate(-50%, -50%) rotate(0deg)`;
        lastRotation = 0;
    }

    requestAnimationFrame(predictWebcam);
}