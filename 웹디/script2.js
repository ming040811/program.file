// script2.js (FINAL CODE: 나비 1x1px 강제 적용)

import { startTracking, stopTracking } from "./butterfly.js";

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const verticalGuide = document.querySelector('.vertical-guide'); 
    const horizontalGuide = document.querySelector('.horizontal-guide'); 
    const video = document.getElementById('live-view');
    
    let activeButterflyElement = null; 
    let activeButterflyData = null;     

    // 웹캠 시작 
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(stream => {
        video.srcObject = stream;
        console.log("Webcam started.");
    }).catch(err => {
        console.error("Error accessing webcam: ", err);
    });
    
    // 데이터 모델
    const storyData = {
        '1': { background: '', decorations: [], lastRotation: 0 },
        '2': { background: '', decorations: [], lastRotation: 0 },
        '3': { background: '', decorations: [], lastRotation: 0 },
        '4': { background: '', decorations: [], lastRotation: 0 },
        '5': { background: '', decorations: [], lastRotation: 0 },
        '6': { background: '', decorations: [], lastRotation: 0 },
    };
    let currentScene = 1;

    // 에셋 추가 이벤트 리스너
    document.querySelectorAll('.asset-item[data-type="decoration"]').forEach(item => {
        item.addEventListener('click', () => {
            const canvasImageSrc = item.dataset.canvasSrc || item.src;

            let initialWidth = 400; 
            let initialHeight = 400; 
            let isButterfly = canvasImageSrc.includes('나비.png');

            if (isButterfly) { 
                // ⭐⭐ 나비 크기 1px x 1px로 고정 ⭐⭐
                initialWidth = 1; 
                initialHeight = 1;
            }
            // ... (기타 아이템 크기 계산 로직 유지) ...
            else if (canvasImageSrc.includes('가로등1-2.png')) {
                const originalWidth = 340;
                const originalHeight = 1200;
                initialHeight = 400; 
                initialWidth = (originalWidth / originalHeight) * initialHeight;
            } 
            else if (canvasImageSrc.includes('쌍가로등1-2.png')) {
                const originalWidth = 450;
                const originalHeight = 1200;
                initialHeight = 400; 
                initialWidth = (originalWidth / originalHeight) * initialHeight;
            }

            const xPos = isButterfly
                ? (canvas.offsetWidth / 2) 
                : (canvas.offsetWidth / 2) - (initialWidth / 2); 
            
            const yPos = isButterfly
                ? (canvas.offsetHeight / 2) 
                : (canvas.offsetHeight / 2) - (initialHeight / 2); 

            const newDeco = {
                id: 'deco-' + Date.now(),
                src: canvasImageSrc,
                width: initialWidth, 
                height: initialHeight,
                x: xPos, 
                y: yPos, 
                rotation: 0,
                scaleX: 1,
                isButterfly: isButterfly 
            };
            storyData[currentScene].decorations.push(newDeco);
            renderScene(currentScene);
        });
    });

    // 배경 추가 이벤트 리스너 (유지)
    document.querySelectorAll('.asset-item[data-type="background"]').forEach(item => {
           item.addEventListener('click', () => {
               storyData[currentScene].background = item.src;
               renderScene(currentScene);
           });
    });

    // 씬 렌더링 함수
    function renderScene(sceneNumber) {
        const data = storyData[sceneNumber];
        canvas.style.backgroundImage = data.background ? `url(${data.background})` : 'none';
        
        stopTracking(); 
        activeButterflyElement = null; 
        activeButterflyData = null;

        Array.from(canvas.children).forEach(child => {
            if (child.classList.contains('decoration-item')) {
                child.remove();
            }
        });
        
        let newButterflyElement = null;
        let newButterflyData = null;

        data.decorations.forEach(decoData => {
            const el = createDecorationElement(decoData);
            if (decoData.isButterfly) {
                newButterflyElement = el; 
                newButterflyData = decoData; 
                el.classList.add('selected'); 
            }
        });

        activeButterflyElement = newButterflyElement;
        activeButterflyData = newButterflyData;

        if (activeButterflyElement) {
            startTracking(video, data, {
                element: activeButterflyElement,
                data: activeButterflyData
            });
            video.style.opacity = 0.5; 
        } else {
            video.style.opacity = 0;
        }

        updateThumbnail(sceneNumber);
    }

    // 장식 엘리먼트 생성 함수
    function createDecorationElement(decoData) {
        const item = document.createElement('div');
        item.className = 'decoration-item';
        item.id = decoData.id;
        
        // 나비 크기는 1px로 고정되어 item에 적용됨
        item.style.left = decoData.x + 'px';
        item.style.top = decoData.y + 'px';
        item.style.width = decoData.width + 'px';
        item.style.height = decoData.height + 'px';
        
        item.style.transform = decoData.isButterfly 
            ? `translate(-50%, -50%) rotate(${decoData.rotation}deg)` 
            : `rotate(${decoData.rotation}deg)`;

        const img = document.createElement('img');
        img.src = decoData.src;
        img.style.transform = `scaleX(${decoData.scaleX})`;
        
        // ⭐⭐ 나비일 경우, 이미지 크기도 100%(1px)로 명시적 적용 (크기 문제 방지)
        if (decoData.isButterfly) {
            img.style.width = '100%';
            img.style.height = '100%';
        }
        
        const controls = document.createElement('div');
        controls.className = 'controls';

        // 좌우 반전과 삭제 버튼만 추가
        controls.innerHTML = `<button class="flip" title="좌우반전"><img src="img/좌우반전.png" alt="좌우반전"></button>
                              <button class="delete" title="삭제"><img src="img/휴지통.png" alt="삭제"></button>`;
        
        if (decoData.isButterfly) {
            item.classList.add('butterfly-item');
        }
        
        item.append(img, controls); 
        canvas.appendChild(item);

        makeInteractive(item); 
        
        return item;
    }
    
    // 아이템 상호작용 (드래그/리사이즈 로직 없음)
    function makeInteractive(element) {
        const decoData = storyData[currentScene].decorations.find(d => d.id === element.id);
        if (!decoData) return;

        // 아이템 클릭 시 선택 및 나비 추적 제어
        element.addEventListener('mousedown', (e) => {
            document.querySelectorAll('.decoration-item').forEach(el => el.classList.remove('selected'));
            element.classList.add('selected');
            
            if (decoData.isButterfly) {
                activeButterflyElement = element;
                activeButterflyData = decoData;
                startTracking(video, storyData[currentScene], {
                    element: activeButterflyElement,
                    data: activeButterflyData
                });
                video.style.opacity = 0.5;
            } else {
                if(activeButterflyElement) {
                    stopTracking(); 
                    video.style.opacity = 0;
                }
                activeButterflyElement = null; 
                activeButterflyData = null;
            }
            e.stopPropagation();
        });

        // 좌우 반전 기능
        const flipButton = element.querySelector('.flip');
        if (flipButton) { 
            flipButton.addEventListener('click', (e) => {
                e.stopPropagation();
                decoData.scaleX *= -1;
                element.querySelector('img').style.transform = `scaleX(${decoData.scaleX})`;
                updateThumbnail(currentScene);
            });
        }
        
        // 삭제 버튼 이벤트 리스너
        element.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            
            if (decoData.isButterfly) {
                stopTracking(); 
                activeButterflyElement = null;
                activeButterflyData = null;
                video.style.opacity = 0;
            }
            
            const index = storyData[currentScene].decorations.findIndex(d => d.id === element.id);
            if (index > -1) {
                storyData[currentScene].decorations.splice(index, 1);
                element.remove();
                updateThumbnail(currentScene);
            }
        });
    }

    // 캔버스 배경 클릭 시 선택 해제
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.decoration-item') && !e.target.closest('.asset-item')) {
            document.querySelectorAll('.decoration-item').forEach(el => el.classList.remove('selected'));
        }
    });

    // ----------------------------------------------------------------------
    // 씬/탭 관련 로직 (유지)
    // ----------------------------------------------------------------------
    const tabs = document.querySelectorAll('.tab-button');
    const assetLists = document.querySelectorAll('.asset-list');
    const scenes = document.querySelectorAll('.scene'); 

    scenes.forEach(scene => {
        scene.addEventListener('click', () => {
            scenes.forEach(s => s.classList.remove('active'));
            scene.classList.add('active');
            const newSceneNumber = scene.dataset.scene;
            currentScene = newSceneNumber;
            renderScene(currentScene);
        });
    });
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            assetLists.forEach(list => list.style.display = 'none');
            const targetList = document.getElementById(tab.dataset.tab);
            if (targetList) {
                targetList.style.display = 'grid';
            }
        });
    });

    // 타임라인 썸네일 업데이트 
    function updateThumbnail(sceneNumber) {
        const sceneEl = document.querySelector(`.scene[data-scene="${sceneNumber}"]`);
        if (sceneEl) {
            sceneEl.innerHTML = ''; 
            
            const sceneData = storyData[sceneNumber];
            sceneEl.style.backgroundImage = sceneData.background ? `url(${sceneData.background})` : 'none';
            
            if(canvas.offsetWidth === 0) return;

            const scaleX = sceneEl.offsetWidth / canvas.offsetWidth;
            const scaleY = sceneEl.offsetHeight / canvas.offsetHeight;

            sceneData.decorations.forEach(decoData => {
                const miniDeco = document.createElement('div');
                miniDeco.style.position = 'absolute';
                
                const thumbnailWidth = decoData.width * scaleX;
                const thumbnailHeight = decoData.height * scaleY;

                miniDeco.style.width = thumbnailWidth + 'px';
                miniDeco.style.height = thumbnailHeight + 'px';

                let leftPos = decoData.x * scaleX;
                let topPos = decoData.y * scaleY;
                let transformStr = `rotate(${decoData.rotation}deg) scaleX(${decoData.scaleX})`;

                if (decoData.isButterfly) {
                    transformStr = `translate(-50%, -50%) ${transformStr}`;
                }
                
                miniDeco.style.left = leftPos + 'px';
                miniDeco.style.top = topPos + 'px';
                miniDeco.style.transform = transformStr;

                miniDeco.style.backgroundImage = `url(${decoData.src})`;
                miniDeco.style.backgroundSize = 'contain';
                miniDeco.style.backgroundRepeat = 'no-repeat';
                miniDeco.style.backgroundPosition = 'center';

                sceneEl.appendChild(miniDeco);
            });
        }
    }
    
    // 초기 씬 렌더링
    renderScene(currentScene);
});