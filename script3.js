document.addEventListener('DOMContentLoaded', () => {
    // Firebase 전역 객체 'db'는 index.html의 <script> 태그에서 초기화되었습니다.
    if (typeof db === 'undefined') {
        console.error("Firebase Firestore is not initialized. Make sure 'db' is available.");
        console.error("Firebase 연결 실패! HTML 파일의 설정값을 확인하세요.");
        return;
    }

    // 1. 모드 판별, 기본 변수 및 세션 설정
    const urlParams = new URLSearchParams(window.location.search);
    const isControllerMode = urlParams.get('mode') === 'controller';
    
    // 세션 ID: PC와 모바일을 연결하는 고유 ID
    let SESSION_ID = urlParams.get('session');
    if (!SESSION_ID) {
        // PC 모드에서만 새로 생성 (또는 URL에서 가져옴)
        SESSION_ID = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        if (!isControllerMode) {
            window.history.replaceState({}, document.title, `?session=${SESSION_ID}`);
        }
    }
    
    const CONTROLLER_REF = db.collection('controllers').doc(SESSION_ID);

    // 기본 DOM 요소 (PC 모드에서만 사용)
    const canvas = document.getElementById('canvas');
    const openControllerBtn = document.getElementById('open-controller-btn');
    const verticalGuide = document.querySelector('.vertical-guide');
    const horizontalGuide = document.querySelector('.horizontal-guide');
    
    // QR 코드 관련 DOM 요소
    const qrModal = document.getElementById('qr-modal');
    const qrcodeDiv = document.getElementById('qrcode-container');

    // ⭐⭐⭐ 경고 메시지 바 DOM 요소 추가 ⭐⭐⭐
    const limitAlert = document.getElementById('limit-alert');
    let alertTimer = null; // 경고 메시지 타이머

    // 스토리 데이터
    const storyData = {
        '1': { background: '', decorations: [] }, 
        '2': { background: '', decorations: [] },
        '3': { background: '', decorations: [] }, '4': { background: '', decorations: [] },
        '5': { background: '', decorations: [] }, '6': { background: '', decorations: [] },
    };
    let currentScene = '1';
    let selectedDecoId = null; 
    let activeDecoId = null; // 컨트롤러 모드에서 현재 조작할 아이템 ID (모바일에서 사용)

    // =========================================================================
    // ⭐ 🚨통신 핵심 로직: Firebase Firestore를 통한 데이터 송수신🚨 ⭐
    // =========================================================================

    // PC -> 모바일 (상태 동기화)
    async function syncStateToFirestore() {
        if (isControllerMode) return; 

        const decoList = storyData[currentScene].decorations.slice(0, 3).map((deco, index) => ({
            id: deco.id,
            index: index + 1
        }));
        
        const state = {
            scene: currentScene,
            selectedId: selectedDecoId,
            decoList: decoList,
            timestamp: firebase.firestore.FieldValue.serverTimestamp() 
        };

        try {
            await CONTROLLER_REF.set({ 
                pcState: state 
            }, { merge: true }); 
        } catch (error) {
            console.error("Error syncing state to Firestore:", error);
        }
    }
    
    // 모바일 -> PC (조작 명령 수신 리스너)
    let lastCommandTimestamp = 0; 

    function listenForControlCommands() {
        if (isControllerMode) return; 

        CONTROLLER_REF.onSnapshot((doc) => {
            if (doc.exists && doc.data().command) {
                const command = doc.data().command;
                
                if (command.timestamp && command.timestamp.toMillis() > lastCommandTimestamp) {
                    lastCommandTimestamp = command.timestamp.toMillis();
                    
                    handleControllerControl(command.id, command.action, command.data);

                    CONTROLLER_REF.update({
                        command: firebase.firestore.FieldValue.delete()
                    }).catch(error => {
                        console.error("Error deleting command field:", error);
                    });
                }
            }
        }, (error) => {
            console.error("Error listening for control commands:", error);
        });
    }

    // =========================================================================
    // ⭐ 모바일 컨트롤러 모드 (isControllerMode: true) 로직 ⭐
    // (이전 버전의 코드가 여기에 해당됨)
    // =========================================================================
    if (isControllerMode) {
        // ... (모바일 컨트롤러 관련 로직 - 이전 코드와 동일) ...
        // PC UI 숨김
        document.querySelector('.app-header').style.display = 'none';
        document.querySelector('.app-main').style.display = 'none';
        
        // 모바일 컨트롤러 UI 표시
        const mobileUI = document.getElementById('mobile-controller-ui');
        if (mobileUI) mobileUI.style.display = 'flex';
        
        const statusEl = document.getElementById('controller-status');
        const selectionArea = document.getElementById('deco-selection');
        const touchpad = document.getElementById('touchpad');
        
        // 1. PC 상태 수신 및 UI 업데이트 리스너
        function listenForPCState() {
            CONTROLLER_REF.onSnapshot((doc) => {
                if (!doc.exists || !doc.data().pcState) {
                    statusEl.textContent = "PC 연결 대기 중...";
                    selectionArea.innerHTML = '';
                    return;
                }
                
                const state = doc.data().pcState;
                statusEl.textContent = `Scene ${state.scene} 연결됨`;
                
                // 아이템 선택 버튼 업데이트
                selectionArea.innerHTML = '';
                let hasActiveSelection = false;

                state.decoList.forEach(deco => {
                    const btn = document.createElement('button');
                    // CSS 파일에 정의된 클래스 사용
                    btn.className = 'ctrl-deco-btn'; 
                    // 인라인 스타일 적용 (기존 코드 유지)
                    btn.style.padding = '10px';
                    btn.style.border = '1px solid #ccc';
                    btn.textContent = `아이템 ${deco.index}`;
                    btn.dataset.id = deco.id;
                    
                    if (deco.id === state.selectedId) {
                        btn.style.backgroundColor = '#4F99B2';
                        btn.style.color = 'white';
                        activeDecoId = deco.id;
                        hasActiveSelection = true;
                    } else {
                        btn.style.backgroundColor = '#fff';
                        btn.style.color = 'black';
                    }
                    selectionArea.appendChild(btn);
                });
                
                // PC에서 선택된 아이템이 없으면, 컨트롤러의 activeDecoId를 해제
                if (!hasActiveSelection) {
                    activeDecoId = null; 
                }
                
                // 아이템이 전혀 없는 경우
                if (state.decoList.length === 0) {
                    selectionArea.innerHTML = '<p style="font-size:12px; color:#999; margin:0;">PC에서 아이템을 추가해주세요.</p>';
                    activeDecoId = null;
                }
                
            }, (error) => {
                console.error("Error listening for PC state:", error);
                statusEl.textContent = "연결 오류 발생!";
            });
        }
        
        // 2. 조작 명령 전송
        async function sendCommandToFirestore(action, data = {}) {
            if (!activeDecoId && action !== 'select') {
                return;
            }
            let commandId = (action === 'select' && data.newId) ? data.newId : activeDecoId;
            if (!commandId) {
                 return;
            }
            const command = {
                id: commandId, action: action, data: data,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                await CONTROLLER_REF.set({ command: command }, { merge: true });
            } catch (error) {
                console.error("Error sending command to Firestore:", error);
            }
        }

        // 3. 컨트롤러 이벤트 리스너 설정
        document.querySelectorAll('#control-buttons .ctrl-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action.includes('rotate')) { sendCommandToFirestore('rotate', { direction: action.includes('left') ? 'LEFT' : 'RIGHT' }); } 
                else if (action.includes('scale')) { sendCommandToFirestore('scale', { direction: action.includes('up') ? 'UP' : 'DOWN' }); } 
                else if (action === 'flip') { sendCommandToFirestore('flip'); } 
                else if (action === 'delete') { sendCommandToFirestore('delete'); }
            });
        });
        selectionArea.addEventListener('click', (e) => {
            if (e.target.classList.contains('ctrl-deco-btn')) {
                sendCommandToFirestore('select', { newId: e.target.dataset.id });
            }
        });
        
        // 터치패드 드래그 (Nudge)
        let isDragging = false, startX, startY, isTouch = false, lastNudgeTime = 0;
        const NUDGE_INTERVAL = 16; // 반응속도 60Hz

        const startDrag = (e) => { /* ... 이전 코드와 동일 ... */ 
             if (!activeDecoId) return;
             e.preventDefault();
             isDragging = true;
             startX = isTouch ? e.touches[0].clientX : e.clientX;
             startY = isTouch ? e.touches[0].clientY : e.clientY;
             if (!isTouch && touchpad) touchpad.style.cursor = 'grabbing';
        };
        const onDrag = (e) => { /* ... 이전 코드와 동일 ... */ 
             if (!isDragging) return;
             e.preventDefault();
             const now = Date.now();
             if (now - lastNudgeTime < NUDGE_INTERVAL) return; 
             lastNudgeTime = now;
             const clientX = isTouch ? e.touches[0].clientX : e.clientX;
             const clientY = isTouch ? e.touches[0].clientY : e.clientY;
             const dx = clientX - startX;
             const dy = clientY - startY;
             sendCommandToFirestore('nudge', { dx: dx / 5, dy: dy / 5 });
             startX = clientX;
             startY = clientY;
        };
        const endDrag = () => { /* ... 이전 코드와 동일 ... */ 
             if (isDragging) {
                 isDragging = false;
                 if (!isTouch && touchpad) touchpad.style.cursor = 'grab';
             }
        };

        if(touchpad) {
            touchpad.addEventListener('mousedown', (e) => { isTouch = false; startDrag(e); });
            touchpad.addEventListener('touchstart', (e) => { isTouch = true; if (e.touches.length === 1) startDrag(e); });
        }
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchmove', (e) => { if (e.touches.length === 1) onDrag(e); });
        document.addEventListener('touchend', endDrag);
        
        // 4. PC 상태 수신 시작
        listenForPCState();
        
        return; 
    }

    // =========================================================================
    // ⭐ PC 메인 웹사이트 모드 (isControllerMode: false) 로직 ⭐
    // =========================================================================
    
    listenForControlCommands(); 
    
    if (openControllerBtn) {
        openControllerBtn.addEventListener('click', () => {
            if (qrModal) qrModal.style.display = 'flex';
            
            const currentUrl = window.location.href.split('?')[0]; 
            // ❗️ 중요: QR 코드는 여전히 ?mode=controller 파라미터를 사용합니다.
            const controllerUrl = `${currentUrl}?session=${SESSION_ID}&mode=controller`; 

            if (qrcodeDiv) qrcodeDiv.innerHTML = '';
            
            if (qrcodeDiv && typeof QRCode !== 'undefined') {
                new QRCode(qrcodeDiv, {
                    text: controllerUrl, width: 256, height: 256,
                    colorDark : "#000000", colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            }
            syncStateToFirestore(); 
        });
    }

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
        syncStateToFirestore(); 
    }

    function updateElementStyle(decoData) { /* ... 이전 코드와 동일 ... */ 
        const element = document.getElementById(decoData.id);
        if (!element) return;
        element.style.left = decoData.x + 'px';
        element.style.top = decoData.y + 'px';
        element.style.width = decoData.width + 'px';
        element.style.height = decoData.height + 'px';
        element.style.transform = `rotate(${decoData.rotation}deg)`;
        const img = element.querySelector('img');
        if (img) { img.style.transform = `scaleX(${decoData.scaleX})`; }
    }

    let pcUpdateTimer = null;
    const PC_UPDATE_INTERVAL = 500; 

    function requestPcUpdate() { /* ... 이전 코드와 동일 ... */ 
        if (pcUpdateTimer) return; 
        pcUpdateTimer = setTimeout(() => {
            syncStateToFirestore(); 
            updateThumbnail(currentScene); 
            pcUpdateTimer = null;
        }, PC_UPDATE_INTERVAL);
    }

    function handleControllerControl(id, action, data) { /* ... 이전 코드와 동일 ... */ 
        let decoData;
        if (action === 'select') { selectItem(data.newId); return; }
        if (id && selectedDecoId !== id) { selectItem(id); }
        if (selectedDecoId === null) return;
        decoData = storyData[currentScene].decorations.find(d => d.id === selectedDecoId);
        if (!decoData) return;
        const step = { rotate: 5, scale: 0.02 }; 

        if (action === 'nudge') {
            const dx = data.dx || 0, dy = data.dy || 0;
            decoData.x += dx * 5; decoData.y += dy * 5;
            updateElementStyle(decoData);
            syncStateToFirestore(); updateThumbnail(currentScene);
        } else if (action === 'rotate') {
            const direction = data.direction;
            if (direction === 'LEFT') { decoData.rotation -= step.rotate; }
            else if (direction === 'RIGHT') { decoData.rotation += step.rotate; }
            updateElementStyle(decoData);
            syncStateToFirestore(); updateThumbnail(currentScene);
        } else if (action === 'scale') {
            const direction = data.direction;
            const factor = 1 + (direction === 'UP' ? step.scale : -step.scale);
            if (decoData.width * factor > 20 && decoData.height * factor > 20) {
                const deltaWidth = (decoData.width * factor) - decoData.width;
                const deltaHeight = (decoData.height * factor) - decoData.height;
                decoData.width *= factor; decoData.height *= factor;
                decoData.x -= deltaWidth / 2; decoData.y -= deltaHeight / 2;
                updateElementStyle(decoData);
                syncStateToFirestore(); updateThumbnail(currentScene);
            }
        } else if (action === 'flip') {
            decoData.scaleX *= -1;
            updateElementStyle(decoData);
            syncStateToFirestore(); updateThumbnail(currentScene);
        } else if (action === 'delete') {
            const index = storyData[currentScene].decorations.findIndex(d => d.id === id);
            if (index > -1) {
                storyData[currentScene].decorations.splice(index, 1);
                const element = document.getElementById(id);
                if (element) element.remove();
                selectItem(null); updateThumbnail(currentScene); return; 
            }
        }
    }

    // --- 4. 장식 아이템 추가 이벤트 핸들러 (PC에서만 작동) ---
    document.querySelectorAll('.asset-item[data-type="decoration"]').forEach(item => {
        item.addEventListener('click', () => {
            // ⭐⭐⭐ 수정: alert() 대신 showAlert() 호출 ⭐⭐⭐
            if (storyData[currentScene].decorations.length >= 3) {
                // console.warn("장식 아이템은 최대 3개까지만 추가할 수 있습니다.");
                showAlert(); // 경고 메시지 표시 함수 호출
                return;
            }
            // ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐

            const canvasImageSrc = item.dataset.canvasSrc || item.src; 
            let initialWidth = 200, initialHeight = 200;
            if (canvasImageSrc.includes('나비.png')) { 
                initialWidth = 150; initialHeight = 150; 
            }
            const newDeco = {
                id: 'deco-' + Date.now(), src: canvasImageSrc,
                width: initialWidth, height: initialHeight,
                x: (canvas.offsetWidth / 2) - (initialWidth / 2),
                y: (canvas.offsetHeight / 2) - (initialHeight / 2),
                rotation: 0, scaleX: 1,
            };
            storyData[currentScene].decorations.push(newDeco);
            renderScene(currentScene); 
            selectItem(newDeco.id);
        });
    });

    function renderScene(sceneNumber) { /* ... 이전 코드와 동일 ... */ 
        if (!canvas) return; 
        const data = storyData[sceneNumber];
        Array.from(canvas.children).forEach(child => {
            if (child.classList.contains('decoration-item')) { child.remove(); }
        });
        data.decorations.forEach(createDecorationElement);
        selectItem(selectedDecoId); 
        setTimeout(() => updateThumbnail(sceneNumber), 50); 
        syncStateToFirestore(); 
    }

    function createDecorationElement(decoData) { /* ... 이전 코드와 동일 ... */ 
        if (!canvas) return; 
        const item = document.createElement('div');
        item.className = 'decoration-item'; item.id = decoData.id;
        item.style.left = decoData.x + 'px'; item.style.top = decoData.y + 'px';
        item.style.width = decoData.width + 'px'; item.style.height = decoData.height + 'px';
        item.style.transform = `rotate(${decoData.rotation}deg)`;
        const img = document.createElement('img');
        img.src = decoData.src;
        img.onerror = function() { img.src = `https://placehold.co/${Math.round(decoData.width)}x${Math.round(decoData.height)}/eee/ccc?text=이미지+로드+실패`; };
        img.style.transform = `scaleX(${decoData.scaleX})`;
        const controls = document.createElement('div');
        controls.className = 'controls';
        controls.innerHTML = `<button class="flip" title="좌우반전"><img src="img/좌우반전.png" alt="좌우반전" onerror="this.parentNode.innerHTML='반전'"></button>
                              <button class="delete" title="삭제"><img src="img/휴지통.png" alt="삭제" onerror="this.parentNode.innerHTML='삭제'"></button>`;
        const handles = ['tl', 'tr', 'bl', 'br', 'rotator'].map(type => {
            const handle = document.createElement('div'); handle.className = `handle ${type}`; return handle;
        });
        item.append(img, ...handles, controls);
        canvas.appendChild(item);
        makeInteractive(item);
    }

    function makeInteractive(element) { /* ... 이전 코드와 동일 ... */ 
        const decoData = storyData[currentScene].decorations.find(d => d.id === element.id);
        if (!decoData) return; 
        element.addEventListener('mousedown', (e) => { selectItem(element.id); e.stopPropagation(); });
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        element.onmousedown = function(e) { /* ... 이전 코드와 동일 ... */ 
            if (e.target.closest('.handle') || e.target.closest('.controls')) return;
            e.preventDefault(); pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = closeDragElement; document.onmousemove = elementDrag;
        };
        function elementDrag(e) { /* ... 이전 코드와 동일 ... */ 
            if (verticalGuide) verticalGuide.style.display = 'none'; if (horizontalGuide) horizontalGuide.style.display = 'none';
            pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY; pos3 = e.clientX; pos4 = e.clientY;
            let newTop = element.offsetTop - pos2, newLeft = element.offsetLeft - pos1;
            const snapThreshold = 5; if (!canvas) return;
            const canvasWidth = canvas.offsetWidth, canvasHeight = canvas.offsetHeight, elementWidth = element.offsetWidth, elementHeight = element.offsetHeight;
            const canvasCenterX = canvasWidth / 2, canvasCenterY = canvasHeight / 2;
            const elementCenterX = newLeft + elementWidth / 2, elementCenterY = newTop + elementHeight / 2;
            let snappedX = false, snappedY = false;
            if (Math.abs(elementCenterX - canvasCenterX) < snapThreshold) {
                newLeft = canvasCenterX - elementWidth / 2;
                if (verticalGuide) { verticalGuide.style.left = `${canvasCenterX}px`; verticalGuide.style.display = 'block'; } snappedX = true;
            }
            if (Math.abs(elementCenterY - canvasCenterY) < snapThreshold) {
                newTop = canvasCenterY - elementHeight / 2;
                if (horizontalGuide) { horizontalGuide.style.top = `${canvasCenterY}px`; horizontalGuide.style.display = 'block'; } snappedY = true;
            }
            if (!snappedX && verticalGuide) verticalGuide.style.display = 'none'; if (!snappedY && horizontalGuide) horizontalGuide.style.display = 'none';
            element.style.top = newTop + "px"; element.style.left = newLeft + "px";
        }
        function closeDragElement() { /* ... 이전 코드와 동일 ... */ 
            document.onmouseup = null; document.onmousemove = null;
            if (verticalGuide) verticalGuide.style.display = 'none'; if (horizontalGuide) horizontalGuide.style.display = 'none';
            decoData.x = element.offsetLeft; decoData.y = element.offsetTop;
            updateThumbnail(currentScene); syncStateToFirestore();
        }
        element.querySelectorAll('.handle:not(.rotator)').forEach(handle => { handle.onmousedown = initResize; });
        function initResize(e) { /* ... 이전 코드와 동일 ... */ 
             e.preventDefault(); e.stopPropagation();
             const handleType = e.target.classList[1], rect = element.getBoundingClientRect(), angleRad = decoData.rotation * (Math.PI / 180), aspectRatio = decoData.width / decoData.height; 
             const corners = getRotatedCorners(rect, angleRad), oppositeCornerMap = { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl' }, pivot = corners[oppositeCornerMap[handleType]]; 
             const isLeft = handleType.includes('l'), isTop = handleType.includes('t');
             document.onmousemove = (e_move) => {
                 const mouseVector = { x: e_move.clientX - pivot.x, y: e_move.clientY - pivot.y };
                 const rotatedMouseVector = { x: mouseVector.x * Math.cos(-angleRad) - mouseVector.y * Math.sin(-angleRad), y: mouseVector.x * Math.sin(-angleRad) + mouseVector.y * Math.cos(-angleRad) };
                 let newWidth, newHeight;
                 if (Math.abs(rotatedMouseVector.x) / aspectRatio > Math.abs(rotatedMouseVector.y)) { newWidth = Math.abs(rotatedMouseVector.x); newHeight = newWidth / aspectRatio; } 
                 else { newHeight = Math.abs(rotatedMouseVector.y); newWidth = newHeight * aspectRatio; }
                 if (newWidth < 20) return; 
                 const signX = isLeft ? -1 : 1, signY = isTop ? -1 : 1;
                 const localCenter = { x: (signX * newWidth) / 2, y: (signY * newHeight) / 2 };
                 const rotatedCenterVector = { x: localCenter.x * Math.cos(angleRad) - localCenter.y * Math.sin(angleRad), y: localCenter.x * Math.sin(angleRad) + localCenter.y * Math.cos(angleRad) };
                 const newGlobalCenter = { x: pivot.x + rotatedCenterVector.x, y: pivot.y + rotatedCenterVector.y };
                 if (!canvas) return; const canvasRect = canvas.getBoundingClientRect();
                 const finalLeft = newGlobalCenter.x - (newWidth / 2) - canvasRect.left, finalTop = newGlobalCenter.y - (newHeight / 2) - canvasRect.top;
                 element.style.width = newWidth + 'px'; element.style.height = newHeight + 'px'; element.style.left = finalLeft + 'px'; element.style.top = finalTop + 'px';
             };
             document.onmouseup = () => {
                 document.onmousemove = null; document.onmouseup = null;
                 decoData.width = parseFloat(element.style.width); decoData.height = parseFloat(element.style.height);
                 decoData.x = element.offsetLeft; decoData.y = element.offsetTop;
                 updateThumbnail(currentScene); syncStateToFirestore();
             };
        }
        const rotator = element.querySelector('.rotator');
        if (rotator) { rotator.onmousedown = function(e) { /* ... 이전 코드와 동일 ... */ 
            e.preventDefault(); e.stopPropagation(); const rect = element.getBoundingClientRect(), centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
            const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI); let startRotation = decoData.rotation;
            document.onmousemove = function(e_move) {
                const currentAngle = Math.atan2(e_move.clientY - centerY, e_move.clientX - centerX) * (180 / Math.PI); let newRotation = startRotation + (currentAngle - startAngle);
                const snapThreshold = 6, snappedAngle = Math.round(newRotation / 90) * 90;
                if (Math.abs(newRotation - snappedAngle) < snapThreshold) { newRotation = snappedAngle; }
                element.style.transform = `rotate(${newRotation}deg)`; decoData.rotation = newRotation;
            };
            document.onmouseup = function() { document.onmousemove = null; document.onmouseup = null; updateThumbnail(currentScene); syncStateToFirestore(); };
        }; }
        const flipButton = element.querySelector('.flip');
        if (flipButton) { flipButton.addEventListener('click', (e) => { e.stopPropagation(); handleControllerControl(element.id, 'flip'); }); }
        const deleteButton = element.querySelector('.delete');
        if (deleteButton) { deleteButton.addEventListener('click', (e) => { e.stopPropagation(); handleControllerControl(element.id, 'delete'); }); }
    }

    function getRotatedCorners(rect, angle) { /* ... 이전 코드와 동일 ... */ 
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const corners = { tl: { x: rect.left, y: rect.top }, tr: { x: rect.right, y: rect.top }, bl: { x: rect.left, y: rect.bottom }, br: { x: rect.right, y: rect.bottom } };
        for (const key in corners) { corners[key] = rotatePoint(corners[key], center, angle); } return corners;
    }
    
    function rotatePoint(point, center, angle) { /* ... 이전 코드와 동일 ... */ 
        const dx = point.x - center.x, dy = point.y - center.y;
        const newX = center.x + dx * Math.cos(angle) - dy * Math.sin(angle), newY = center.y + dx * Math.sin(angle) + dy * Math.cos(angle);
        return { x: newX, y: newY };
    }

    document.addEventListener('mousedown', (e) => { /* ... 이전 코드와 동일 ... */ 
        if (!e.target.closest('.decoration-item') && !e.target.closest('.asset-item') && !e.target.closest('#qr-modal')) { selectItem(null); }
    });

    const scenes = document.querySelectorAll('.scene');
    scenes.forEach(scene => { /* ... 이전 코드와 동일 ... */ 
        scene.addEventListener('click', () => {
            scenes.forEach(s => s.classList.remove('active')); scene.classList.add('active');
            currentScene = scene.dataset.scene; selectedDecoId = null; renderScene(currentScene); 
        });
    });
    
    function updateThumbnail(sceneNumber) { /* ... 이전 코드와 동일 ... */ 
        const sceneEl = document.querySelector(`.scene[data-scene="${sceneNumber}"]`);
        if (sceneEl) {
            sceneEl.innerHTML = ''; const sceneData = storyData[sceneNumber]; sceneEl.style.backgroundImage = 'none';
            if(!canvas || canvas.offsetWidth === 0) return;
            const scaleX = sceneEl.offsetWidth / canvas.offsetWidth, scaleY = sceneEl.offsetHeight / canvas.offsetHeight;
            sceneData.decorations.forEach(decoData => {
                const miniDeco = document.createElement('div');
                miniDeco.style.position = 'absolute';
                miniDeco.style.width = (decoData.width * scaleX) + 'px'; miniDeco.style.height = (decoData.height * scaleY) + 'px';
                miniDeco.style.left = (decoData.x * scaleX) + 'px'; miniDeco.style.top = (decoData.y * scaleY) + 'px';
                miniDeco.style.backgroundImage = `url(${decoData.src})`; miniDeco.style.backgroundSize = 'contain';
                miniDeco.style.backgroundRepeat = 'no-repeat'; miniDeco.style.backgroundPosition = 'center';
                miniDeco.style.transform = `rotate(${decoData.rotation}deg) scaleX(${decoData.scaleX})`;
                sceneEl.appendChild(miniDeco);
            });
        }
    }

    renderScene(currentScene);
    
    if (!isControllerMode) {
        syncStateToFirestore();
    }

    // ⭐⭐⭐ 경고 메시지 표시 함수 추가 ⭐⭐⭐
    function showAlert() {
        if (!limitAlert) return;

        // 이미 타이머가 실행 중이면 초기화
        if (alertTimer) {
            clearTimeout(alertTimer);
        }

        limitAlert.classList.add('show'); // CSS 클래스를 추가하여 보이게 함

        // 3초 후에 자동으로 숨김
        alertTimer = setTimeout(() => {
            limitAlert.classList.remove('show');
            alertTimer = null; // 타이머 초기화
        }, 3000); // 3000ms = 3초
    }
    // ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐

});

