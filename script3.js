document.addEventListener('DOMContentLoaded', () => {
    // 1. 모드 판별 및 기본 변수 설정
    const urlParams = new URLSearchParams(window.location.search);
    const isControllerMode = urlParams.get('mode') === 'controller';
    
    // 통신에 사용할 localStorage 키
    const STORAGE_KEY = 'storyEditorControl';

    // 기본 DOM 요소 (PC 모드에서만 사용)
    const canvas = document.getElementById('canvas');
    const openControllerBtn = document.getElementById('open-controller-btn');
    const verticalGuide = document.querySelector('.vertical-guide');
    const horizontalGuide = document.querySelector('.horizontal-guide');
    
    // QR 코드 관련 DOM 요소
    const qrModal = document.getElementById('qr-modal');
    const qrcodeDiv = document.getElementById('qrcode-container');

    // 스토리 데이터 (초기 이미지 없음)
    const storyData = {
        '1': { background: '', decorations: [] }, 
        '2': { background: '', decorations: [] },
        '3': { background: '', decorations: [] }, '4': { background: '', decorations: [] },
        '5': { background: '', decorations: [] }, '6': { background: '', decorations: [] },
    };
    let currentScene = '1';
    let selectedDecoId = null; 
    let activeDecoId = null; // 컨트롤러 모드에서 현재 조작할 아이템 ID

    // =========================================================================
    // ⭐ 🚨통신 핵심 로직: localStorage를 통한 데이터 송수신🚨 ⭐
    // =========================================================================

    // PC -> 모바일 (상태 동기화)
    function syncStateToStorage() {
        const decoList = storyData[currentScene].decorations.slice(0, 3).map((deco, index) => ({
            id: deco.id,
            index: index + 1
        }));
        
        const state = {
            scene: currentScene,
            selectedId: selectedDecoId,
            decoList: decoList,
            timestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY + 'State', JSON.stringify(state));
    }
    
    // 모바일 -> PC (조작 명령 수신)
    function checkControlCommand() {
        const commandStr = localStorage.getItem(STORAGE_KEY + 'Command');
        if (commandStr) {
            const command = JSON.parse(commandStr);
            // 명령 처리 후, 명령을 지워서 중복 실행을 막습니다.
            localStorage.removeItem(STORAGE_KEY + 'Command'); 
            handleControllerControl(command.id, command.action, command.data);
        }
    }
    
    // PC 모드에서 100ms마다 명령을 확인합니다.
    if (!isControllerMode) {
        setInterval(checkControlCommand, 100); 
    }

    // =========================================================================
    // ⭐ 모바일 컨트롤러 모드 (isControllerMode: true) 로직 ⭐
    // =========================================================================
    if (isControllerMode) {
        const pcUI = document.querySelector('.app-header, .app-main, .timeline, #qr-modal');
        if (pcUI) {
            // PC UI 숨김
            document.querySelector('.app-header').style.display = 'none';
            document.querySelector('.app-main').style.display = 'none';
            document.querySelector('.timeline').style.display = 'none';
        }
        
        // 모바일 컨트롤러 UI 표시
        const mobileUI = document.getElementById('mobile-controller-ui');
        if (mobileUI) mobileUI.style.display = 'flex';
        
        const statusEl = document.getElementById('controller-status');
        const selectionArea = document.getElementById('deco-selection');
        const touchpad = document.getElementById('touchpad');
        
        // 1. 상태 수신 및 UI 업데이트
        function updateControllerUI() {
            const stateStr = localStorage.getItem(STORAGE_KEY + 'State');
            if (!stateStr) {
                statusEl.textContent = "PC 사이트 로드 대기 중...";
                selectionArea.innerHTML = '';
                return;
            }
            
            const state = JSON.parse(stateStr);
            statusEl.textContent = `Scene ${state.scene} 연결됨`;
            
            // 아이템 선택 버튼 업데이트
            selectionArea.innerHTML = '';
            state.decoList.forEach(deco => {
                const btn = document.createElement('button');
                btn.className = 'ctrl-deco-btn';
                btn.textContent = `아이템 ${deco.index}`;
                btn.dataset.id = deco.id;
                
                if (deco.id === state.selectedId) {
                    btn.style.backgroundColor = '#4F99B2';
                    btn.style.color = 'white';
                    activeDecoId = deco.id;
                } else {
                    btn.style.backgroundColor = '#fff';
                    btn.style.color = 'black';
                }
                selectionArea.appendChild(btn);
            });
            
            if (activeDecoId === null && state.decoList.length > 0) {
                activeDecoId = state.decoList[0].id; // 선택된 아이템이 없으면 첫 번째 아이템을 기본으로 설정
            }
        }
        
        // 2. 조작 명령 전송
        function sendCommand(action, data = {}) {
            if (!activeDecoId) {
                alert("PC에서 먼저 조작할 아이템을 선택하거나 추가해주세요.");
                return;
            }
            const command = {
                id: activeDecoId,
                action: action,
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(STORAGE_KEY + 'Command', JSON.stringify(command));
        }

        // 3. 컨트롤러 이벤트 리스너 설정
        
        // 일반 버튼 (회전, 확대/축소, 반전, 삭제)
        document.querySelectorAll('#control-buttons .ctrl-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                
                if (action.includes('rotate')) {
                    sendCommand('rotate', { direction: action.includes('left') ? 'LEFT' : 'RIGHT' });
                } else if (action.includes('scale')) {
                    sendCommand('scale', { direction: action.includes('up') ? 'UP' : 'DOWN' });
                } else if (action === 'flip') {
                    sendCommand('flip');
                } else if (action === 'delete') {
                    sendCommand('delete');
                }
            });
        });

        // 아이템 선택 버튼
        selectionArea.addEventListener('click', (e) => {
            if (e.target.classList.contains('ctrl-deco-btn')) {
                const newId = e.target.dataset.id;
                activeDecoId = newId;
                // PC에 아이템 선택 명령을 보낼 수도 있지만, PC에서 선택된 상태를 따라가는 것이 더 안정적입니다.
                // 여기서는 로컬 activeDecoId만 변경합니다.
                
                // PC에 선택 명령을 보내려면:
                // sendCommand('select', { newId: newId });
            }
        });
        
        // 터치패드 드래그 (Nudge)
        let isDragging = false;
        let startX, startY;

        touchpad.addEventListener('mousedown', (e) => {
            if (!activeDecoId) return;
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            touchpad.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // PC로 NUDGE 명령 전송 (미세 조정을 위해 5로 나눔)
            sendCommand('nudge', { dx: dx / 5, dy: dy / 5 });
            
            // 시작점을 현재 위치로 업데이트하여 연속적인 명령 전송
            startX = e.clientX;
            startY = e.clientY;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                touchpad.style.cursor = 'grab';
            }
        });

        // 모바일 환경을 위한 터치 이벤트 추가 (mousemove 대신 touchmove)
        touchpad.addEventListener('touchstart', (e) => {
            if (!activeDecoId || e.touches.length !== 1) return;
            e.preventDefault();
            isDragging = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging || e.touches.length !== 1) return;
            e.preventDefault();
            
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;

            sendCommand('nudge', { dx: dx / 5, dy: dy / 5 });
            
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        });

        document.addEventListener('touchend', () => {
            isDragging = false;
        });
        
        // 4. PC 상태를 100ms마다 확인하여 UI 업데이트
        setInterval(updateControllerUI, 100);
        updateControllerUI();
        
        return; // 메인 사이트의 나머지 로직 실행 중단
    }

    // =========================================================================
    // ⭐ PC 메인 웹사이트 모드 (isControllerMode: false) 로직 (기존 코드 유지) ⭐
    // =========================================================================

    // --- ⭐ 컨트롤러 창 열기 이벤트 리스너 (QR 코드 표시로 변경) ⭐ ---
    if (openControllerBtn) {
        openControllerBtn.addEventListener('click', () => {
            if (qrModal) qrModal.style.display = 'flex';

            const currentUrl = window.location.href.split('?')[0]; 
            const controllerUrl = `${currentUrl}?mode=controller`;

            if (qrcodeDiv) qrcodeDiv.innerHTML = '';
            
            if (qrcodeDiv && typeof QRCode !== 'undefined') {
                new QRCode(qrcodeDiv, {
                    text: controllerUrl, 
                    width: 256,
                    height: 256,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            }
        });
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
        syncStateToStorage(); // 상태 변경 시 컨트롤러에 동기화
    }

    // --- 3. 컨트롤러 조작 명령 처리 함수 ---
    // PC에서 직접 실행하거나, 모바일에서 온 명령을 여기서 처리합니다.
    function handleControllerControl(id, action, data) {
        let decoData;
        
        // 모바일에서 보낸 ID가 현재 선택된 아이템이 아니더라도, 해당 아이템을 조작합니다.
        if (id && selectedDecoId !== id) {
            selectItem(id);
        }
        
        decoData = storyData[currentScene].decorations.find(d => d.id === selectedDecoId);
        if (!decoData) return;

        const step = { move: 5, rotate: 5, scale: 0.02 };
        let updated = false;

        if (action === 'nudge') {
            const dx = data.dx || 0;
            const dy = data.dy || 0;
            
            decoData.x += dx;
            decoData.y += dy;
            updated = true;
            
        } else if (action === 'move') {
            // 이 버튼 조작은 현재 컨트롤러 UI에 없습니다. (Nudge로 대체)
        } else if (action === 'rotate') {
            const direction = data.direction;
            if (direction === 'LEFT') { decoData.rotation -= step.rotate; updated = true; }
            else if (direction === 'RIGHT') { decoData.rotation += step.rotate; updated = true; }
            
        } else if (action === 'scale') {
            const direction = data.direction;
            const factor = 1 + (direction === 'UP' ? step.scale : -step.scale);
            
            if (decoData.width * factor > 20 && decoData.height * factor > 20) {
                const deltaWidth = (decoData.width * factor) - decoData.width;
                const deltaHeight = (decoData.height * factor) - decoData.height;
                
                decoData.width *= factor;
                decoData.height *= factor;
                decoData.x -= deltaWidth / 2;
                decoData.y -= deltaHeight / 2;
                
                updated = true;
            }
        } else if (action === 'flip') {
            decoData.scaleX *= -1;
            updated = true;
        } else if (action === 'delete') {
             const index = storyData[currentScene].decorations.findIndex(d => d.id === id);
            if (index > -1) {
                storyData[currentScene].decorations.splice(index, 1);
                const element = document.getElementById(id);
                if (element) element.remove();
                selectItem(null); // 삭제 후 선택 해제 및 동기화
                updateThumbnail(currentScene);
                return; // 렌더링을 이미 했으므로 아래 renderScene 호출 방지
            }
        }

        if (updated) {
            renderScene(currentScene); 
        }
    }

    // --- 4. 장식 아이템 추가 이벤트 핸들러 ---
    document.querySelectorAll('.asset-item[data-type="decoration"]').forEach(item => {
        item.addEventListener('click', () => {
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
                id: 'deco-' + Date.now(),
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
            selectItem(newDeco.id);
        });
    });


    // --- 5. 씬 렌더링 함수 ---
    function renderScene(sceneNumber) {
        const data = storyData[sceneNumber];
        
        // 기존 아이템 제거
        Array.from(canvas.children).forEach(child => {
            if (child.classList.contains('decoration-item')) {
                child.remove();
            }
        });
        
        data.decorations.forEach(createDecorationElement);
        selectItem(selectedDecoId); 
        
        setTimeout(() => updateThumbnail(sceneNumber), 50); 
        syncStateToStorage(); // 렌더링 후 상태 동기화
    }

    // --- 6. 장식 요소 생성 함수 ---
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
            syncStateToStorage();
        }
        
        // 크기 조절 (리사이즈)
        element.querySelectorAll('.handle:not(.rotator)').forEach(handle => {
            handle.onmousedown = initResize;
        });
        
        function initResize(e) {
            e.preventDefault();
            e.stopPropagation();

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
                syncStateToStorage();
            };
        }

        // 회전 (로테이터 핸들)
        const rotator = element.querySelector('.rotator');
        rotator.onmousedown = function(e) {
            e.preventDefault(); e.stopPropagation();
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
                syncStateToStorage();
            };
        };

        // 좌우 반전 버튼
        element.querySelector('.flip').addEventListener('click', (e) => {
            e.stopPropagation();
            handleControllerControl(element.id, 'flip');
        });
        
        // 삭제 버튼
        element.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            handleControllerControl(element.id, 'delete');
        });
    }

    // --- 8. 헬퍼 함수 (회전된 좌표 계산) ---
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

    // --- 9. 캔버스 외부 클릭 시 선택 해제 ---
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.decoration-item') && !e.target.closest('.asset-item') && !e.target.closest('#qr-modal')) {
            selectItem(null);
        }
    });

    // --- 10. 씬 전환 ---
    const scenes = document.querySelectorAll('.scene');
    scenes.forEach(scene => {
        scene.addEventListener('click', () => {
            scenes.forEach(s => s.classList.remove('active'));
            scene.classList.add('active');
            currentScene = scene.dataset.scene;
            selectedDecoId = null;
            renderScene(currentScene);
        });
    });
    
    // --- 11. 타임라인 썸네일 업데이트 ---
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