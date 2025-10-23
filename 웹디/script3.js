document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const verticalGuide = document.querySelector('.vertical-guide');
    const horizontalGuide = document.querySelector('.horizontal-guide');

    const storyData = {
        '1': { background: '', decorations: [] }, '2': { background: '', decorations: [] },
        '3': { background: '', decorations: [] }, '4': { background: '', decorations: [] },
        '5': { background: '', decorations: [] }, '6': { background: '', decorations: [] },
    };
    let currentScene = 1;
    let selectedDecoId = null; // 현재 캔버스에서 선택된 아이템 ID

    // --- 1. 통신: 현재 아이템 목록을 컨트롤러에 전달 ---
    function sendDecorationList() {
        // 현재 활성 씬의 아이템 ID와 인덱스 정보를 JSON 문자열로 변환
        const decoList = storyData[currentScene].decorations.map((deco, index) => ({
            id: deco.id,
            index: index + 1
        }));
        
        const message = {
            type: 'DECO_LIST_UPDATE',
            data: decoList,
            scene: currentScene,
            selectedId: selectedDecoId
        };
        
        // window.opener가 존재하고 controller.html이 열려 있다면, 메시지를 보냅니다.
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage(message, '*');
        }
    }

    // --- 2. 통신: 모바일 컨트롤러로부터 메시지 수신 처리 ---
    window.addEventListener('message', (event) => {
        if (event.data.type === 'REQUEST_DECO_LIST') {
            // 컨트롤러가 초기 상태를 요청했을 때
            sendDecorationList();
        } else if (event.data.type === 'DECO_SELECT') {
            // 컨트롤러가 아이템 선택을 요청했을 때
            const newId = event.data.id;
            selectItem(newId);
        } else if (event.data.type === 'DECO_CONTROL') {
            // 컨트롤러가 아이템 조작을 요청했을 때
            handleControllerControl(event.data.id, event.data.action, event.data.direction);
        }
    });

    // --- 3. 컨트롤러 조작 명령 처리 함수 ---
    function handleControllerControl(id, action, direction) {
        const decoData = storyData[currentScene].decorations.find(d => d.id === id);
        if (!decoData) return;

        const step = { move: 5, rotate: 5, scale: 0.02 };
        let updated = false;

        if (action === 'move') {
            if (direction === 'UP') { decoData.y -= step.move; updated = true; }
            else if (direction === 'DOWN') { decoData.y += step.move; updated = true; }
            else if (direction === 'LEFT') { decoData.x -= step.move; updated = true; }
            else if (direction === 'RIGHT') { decoData.x += step.move; updated = true; }
        } else if (action === 'rotate') {
            if (direction === 'LEFT') { decoData.rotation -= step.rotate; updated = true; }
            else if (direction === 'RIGHT') { decoData.rotation += step.rotate; updated = true; }
        } else if (action === 'scale') {
            // 크기 조절 (상/하 버튼으로 가정)
            const factor = 1 + (direction === 'UP' ? step.scale : -step.scale);
            if (decoData.width * factor > 20 && decoData.height * factor > 20) { // 최소 크기 제한
                decoData.width *= factor;
                decoData.height *= factor;
                updated = true;
            }
        }

        if (updated) {
            // 데이터 업데이트 후 캔버스를 다시 그리고 썸네일/통신 업데이트
            renderScene(currentScene);
        }
    }

    // --- 아이템 선택 처리 함수 ---
    function selectItem(id) {
        document.querySelectorAll('.decoration-item').forEach(el => el.classList.remove('selected'));
        selectedDecoId = null;

        if (id) {
            const element = document.getElementById(id);
            if (element) {
                element.classList.add('selected');
                selectedDecoId = id;
            }
        }
        sendDecorationList();
    }


    // --- 4. 장식 아이템 추가 이벤트 핸들러 (아이템 3개 제한 및 통신 추가) ---
    document.querySelectorAll('.asset-item[data-type="decoration"]').forEach(item => {
        item.addEventListener('click', () => {
            // ⭐ 최대 3개 제한 로직 ⭐
            if (storyData[currentScene].decorations.length >= 3) {
                alert("장식 아이템은 최대 3개까지만 추가할 수 있습니다.");
                return;
            }

            const canvasImageSrc = item.dataset.canvasSrc || item.src;
            
            let initialWidth = 200; 
            let initialHeight = 200;

            if (canvasImageSrc.includes('나비.png')) {
                 initialWidth = 150; 
                 initialHeight = 150; 
            }

            const newDeco = {
                id: 'deco-' + Date.now(), // 고유 ID 부여
                src: canvasImageSrc,
                width: initialWidth, 
                height: initialHeight,
                x: (canvas.offsetWidth / 2) - (initialWidth / 2),
                y: (canvas.offsetHeight / 2) - (initialHeight / 2),
                rotation: 0,
                scaleX: 1,
            };
            storyData[currentScene].decorations.push(newDeco);
            renderScene(currentScene);
            selectItem(newDeco.id); // 새로 추가된 아이템 선택
        });
    });


    // --- 5. 씬 렌더링 함수 (통신 로직 추가) ---
    function renderScene(sceneNumber) {
        const data = storyData[sceneNumber];
        canvas.style.backgroundImage = 'none'; 
        
        // 기존 장식 요소 제거
        Array.from(canvas.children).forEach(child => {
            if (child.classList.contains('decoration-item')) {
                child.remove();
            }
        });
        
        // 새 장식 요소 추가
        data.decorations.forEach(createDecorationElement);
        // 캔버스 요소를 다시 그린 후, 이전에 선택된 아이템을 다시 선택
        selectItem(selectedDecoId); 
        
        setTimeout(() => updateThumbnail(sceneNumber), 50); 
        sendDecorationList(); // 씬이 렌더링될 때도 컨트롤러에 목록 업데이트 전송
    }

    // --- 6. 장식 요소 생성 함수 (이전과 동일) ---
    function createDecorationElement(decoData) {
        const item = document.createElement('div');
        item.className = 'decoration-item';
        item.id = decoData.id;
        item.style.left = decoData.x + 'px';
        item.style.top = decoData.y + 'px';
        item.style.width = decoData.width + 'px';
        item.style.height = decoData.height + 'px';
        item.style.transform = `rotate(${decoData.rotation}deg)`;

        const img = document.createElement('img');
        img.src = decoData.src;
        img.style.transform = `scaleX(${decoData.scaleX})`;

        const controls = document.createElement('div');
        controls.className = 'controls';
        controls.innerHTML = `<button class="flip" title="좌우반전"><img src="img/좌우반전.png" alt="좌우반전"></button>
                              <button class="delete" title="삭제"><img src="img/휴지통.png" alt="삭제"></button>`;
        
        const handles = ['tl', 'tr', 'bl', 'br', 'rotator'].map(type => {
            const handle = document.createElement('div');
            handle.className = `handle ${type}`;
            return handle;
        });

        item.append(img, ...handles, controls);
        canvas.appendChild(item);

        makeInteractive(item);
    }

    // --- 7. 인터랙티브 기능 부여 함수 (드래그, 리사이즈, 회전, 컨트롤) ---
    function makeInteractive(element) {
        const decoData = storyData[currentScene].decorations.find(d => d.id === element.id);

        // 선택
        element.addEventListener('mousedown', (e) => {
            selectItem(element.id);
            e.stopPropagation();
        });

        // 이동 (드래그)
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        element.onmousedown = function(e) {
            if (e.target.closest('.handle') || e.target.closest('.controls')) return;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };

        function elementDrag(e) {
            // ... (기존 드래그 로직) ...
            verticalGuide.style.display = 'none';
            horizontalGuide.style.display = 'none';

            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;

            const snapThreshold = 5; 
            
            const canvasWidth = canvas.offsetWidth;
            const canvasHeight = canvas.offsetHeight;
            const elementWidth = element.offsetWidth;
            const elementHeight = element.offsetHeight;

            const canvasCenterX = canvasWidth / 2;
            const canvasCenterY = canvasHeight / 2;

            const elementCenterX = newLeft + elementWidth / 2;
            const elementCenterY = newTop + elementHeight / 2;

            let snappedX = false;
            let snappedY = false;

            // 가로 중앙 스냅
            if (Math.abs(elementCenterX - canvasCenterX) < snapThreshold) {
                newLeft = canvasCenterX - elementWidth / 2;
                verticalGuide.style.left = `${canvasCenterX}px`;
                verticalGuide.style.display = 'block';
                snappedX = true;
            }

            // 세로 중앙 스냅
            if (Math.abs(elementCenterY - canvasCenterY) < snapThreshold) {
                newTop = canvasCenterY - elementHeight / 2;
                horizontalGuide.style.top = `${canvasCenterY}px`;
                horizontalGuide.style.display = 'block';
                snappedY = true;
            }

            if (!snappedX) verticalGuide.style.display = 'none';
            if (!snappedY) horizontalGuide.style.display = 'none';
            
            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;

            verticalGuide.style.display = 'none';
            horizontalGuide.style.display = 'none';

            decoData.x = element.offsetLeft;
            decoData.y = element.offsetTop;
            updateThumbnail(currentScene);
            sendDecorationList(); // ⭐ 통신 추가 ⭐
        }
        
        // 크기 조절 (리사이즈)
        element.querySelectorAll('.handle:not(.rotator)').forEach(handle => {
            handle.onmousedown = initResize;
        });
        
        function initResize(e) {
            e.preventDefault();
            e.stopPropagation();
            // ... (기존 리사이즈 로직) ...
            const handleType = e.target.classList[1];
            const rect = element.getBoundingClientRect();
            const angleRad = decoData.rotation * (Math.PI / 180);
            const aspectRatio = decoData.width / decoData.height; 

            const corners = getRotatedCorners(rect, angleRad);
            const oppositeCornerMap = { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl' };
            const pivot = corners[oppositeCornerMap[handleType]]; 

            const isLeft = handleType.includes('l');
            const isTop = handleType.includes('t');

            document.onmousemove = (e_move) => {
                const mouseVector = {
                    x: e_move.clientX - pivot.x,
                    y: e_move.clientY - pivot.y
                };

                const rotatedMouseVector = {
                    x: mouseVector.x * Math.cos(-angleRad) - mouseVector.y * Math.sin(-angleRad),
                    y: mouseVector.x * Math.sin(-angleRad) + mouseVector.y * Math.cos(-angleRad)
                };
                
                let newWidth, newHeight;
                
                if (Math.abs(rotatedMouseVector.x) / aspectRatio > Math.abs(rotatedMouseVector.y)) {
                    newWidth = Math.abs(rotatedMouseVector.x);
                    newHeight = newWidth / aspectRatio;
                } else {
                    newHeight = Math.abs(rotatedMouseVector.y);
                    newWidth = newHeight * aspectRatio;
                }

                if (newWidth < 20) return; 

                const signX = isLeft ? -1 : 1;
                const signY = isTop ? -1 : 1;

                const localCenter = {
                    x: (signX * newWidth) / 2,
                    y: (signY * newHeight) / 2
                };

                const rotatedCenterVector = {
                    x: localCenter.x * Math.cos(angleRad) - localCenter.y * Math.sin(angleRad),
                    y: localCenter.x * Math.sin(angleRad) + localCenter.y * Math.cos(angleRad)
                };
                
                const newGlobalCenter = {
                    x: pivot.x + rotatedCenterVector.x,
                    y: pivot.y + rotatedCenterVector.y
                };

                const canvasRect = canvas.getBoundingClientRect();
                const finalLeft = newGlobalCenter.x - (newWidth / 2) - canvasRect.left;
                const finalTop = newGlobalCenter.y - (newHeight / 2) - canvasRect.top;

                element.style.width = newWidth + 'px';
                element.style.height = newHeight + 'px';
                element.style.left = finalLeft + 'px';
                element.style.top = finalTop + 'px';
            };

            document.onmouseup = () => {
                document.onmousemove = null;
                document.onmouseup = null;
                decoData.width = parseFloat(element.style.width);
                decoData.height = parseFloat(element.style.height);
                decoData.x = element.offsetLeft;
                decoData.y = element.offsetTop;
                updateThumbnail(currentScene);
                sendDecorationList(); // ⭐ 통신 추가 ⭐
            };
        }

        // 회전 (로테이터 핸들)
        const rotator = element.querySelector('.rotator');
        rotator.onmousedown = function(e) {
            e.preventDefault(); e.stopPropagation();
            // ... (기존 회전 로직) ...
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
            const startRotation = decoData.rotation;

            document.onmousemove = function(e_move) {
                const currentAngle = Math.atan2(e_move.clientY - centerY, e_move.clientX - centerX) * (180 / Math.PI);
                let newRotation = startRotation + (currentAngle - startAngle);
                
                const snapThreshold = 6;
                const snappedAngle = Math.round(newRotation / 90) * 90;

                if (Math.abs(newRotation - snappedAngle) < snapThreshold) {
                    newRotation = snappedAngle;
                }
                
                element.style.transform = `rotate(${newRotation}deg)`;
                decoData.rotation = newRotation;
            };
            document.onmouseup = function() {
                document.onmousemove = null; document.onmouseup = null;
                updateThumbnail(currentScene);
                sendDecorationList(); // ⭐ 통신 추가 ⭐
            };
        };

        // 좌우 반전 버튼
        element.querySelector('.flip').addEventListener('click', (e) => {
            e.stopPropagation();
            decoData.scaleX *= -1;
            element.querySelector('img').style.transform = `scaleX(${decoData.scaleX})`;
            updateThumbnail(currentScene);
            sendDecorationList(); // ⭐ 통신 추가 ⭐
        });
        
        // 삭제 버튼
        element.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            const index = storyData[currentScene].decorations.findIndex(d => d.id === element.id);
            if (index > -1) {
                storyData[currentScene].decorations.splice(index, 1);
                element.remove();
                
                // 삭제된 아이템이 현재 선택된 아이템이었다면 선택 해제
                if (selectedDecoId === element.id) {
                    selectItem(null);
                } else {
                    sendDecorationList(); // ⭐ 통신 추가 ⭐
                }
                updateThumbnail(currentScene);
            }
        });
    }

    // --- 8. 헬퍼 함수 (이전과 동일) ---
    function getRotatedCorners(rect, angle) {
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const corners = {
            tl: { x: rect.left, y: rect.top }, tr: { x: rect.right, y: rect.top },
            bl: { x: rect.left, y: rect.bottom }, br: { x: rect.right, y: rect.bottom }
        };
        for (const key in corners) {
            corners[key] = rotatePoint(corners[key], center, angle);
        }
        return corners;
    }
    
    function rotatePoint(point, center, angle) {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const newX = center.x + dx * Math.cos(angle) - dy * Math.sin(angle);
        const newY = center.y + dx * Math.sin(angle) + dy * Math.cos(angle);
        return { x: newX, y: newY };
    }

    // --- 9. 캔버스 외부 클릭 시 선택 해제 (통신 로직 추가) ---
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.decoration-item')) {
            selectItem(null); // 모든 선택 해제
        }
    });

    // --- 10. 씬 전환 (통신 로직 추가) ---
    const scenes = document.querySelectorAll('.scene');
    scenes.forEach(scene => {
        scene.addEventListener('click', () => {
            scenes.forEach(s => s.classList.remove('active'));
            scene.classList.add('active');
            currentScene = scene.dataset.scene;
            selectedDecoId = null; // 씬 전환 시 선택 초기화
            renderScene(currentScene);
        });
    });
    
    // --- 11. 타임라인 썸네일 업데이트 (이전과 동일) ---
    function updateThumbnail(sceneNumber) {
        const sceneEl = document.querySelector(`.scene[data-scene="${sceneNumber}"]`);
        if (sceneEl) {
            sceneEl.innerHTML = ''; 
            
            const sceneData = storyData[sceneNumber];
            sceneEl.style.backgroundImage = 'none';
            
            if(canvas.offsetWidth === 0) return;

            const scaleX = sceneEl.offsetWidth / canvas.offsetWidth;
            const scaleY = sceneEl.offsetHeight / canvas.offsetHeight;

            sceneData.decorations.forEach(decoData => {
                const miniDeco = document.createElement('div');
                miniDeco.style.position = 'absolute';
                miniDeco.style.width = (decoData.width * scaleX) + 'px';
                miniDeco.style.height = (decoData.height * scaleY) + 'px';
                miniDeco.style.left = (decoData.x * scaleX) + 'px';
                miniDeco.style.top = (decoData.y * scaleY) + 'px';
                
                miniDeco.style.backgroundImage = `url(${decoData.src})`;
                miniDeco.style.backgroundSize = 'contain';
                miniDeco.style.backgroundRepeat = 'no-repeat';
                miniDeco.style.backgroundPosition = 'center';
                
                miniDeco.style.transform = `rotate(${decoData.rotation}deg) scaleX(${decoData.scaleX})`;
                
                sceneEl.appendChild(miniDeco);
            });
        }
    }

    // 초기 렌더링
    renderScene(currentScene);
});