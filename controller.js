document.addEventListener('DOMContentLoaded', () => {
    // ❗️ controller.html에서 'db' 객체가 초기화되어야 합니다.
    if (typeof db === 'undefined') {
        console.error("Firebase Firestore 'db' is not initialized.");
        alert("Firebase 연결 실패! HTML을 확인하세요.");
        return;
    }

    // --- 1. 세션 ID 및 Firebase 레퍼런스 설정 ---
    const urlParams = new URLSearchParams(window.location.search);
    const SESSION_ID = urlParams.get('session');
    
    if (!SESSION_ID) {
        alert("유효한 세션 ID가 없습니다. QR 코드를 다시 스캔하세요.");
        document.body.innerHTML = "<h1>연결 실패</h1><p>유효한 세션 ID가 없습니다. PC의 QR 코드를 다시 스캔하세요.</p>";
        return;
    }

    const CONTROLLER_REF = db.collection('controllers').doc(SESSION_ID);

    // --- DOM 요소 ---
    const mainCanvasFrame = document.querySelector('.main-canvas-frame');
    const touchPadsWrapper = document.querySelector('.touch-pads-wrapper');
    const deleteButton = document.getElementById('delete-selected-deco');
    const controlGroupWrapper = document.querySelector('.control-group-wrapper');
    const sceneInfoEl = document.querySelector('.scene-info');

    let currentDecoList = []; 
    let selectedDecoIds = []; 
    const activeTouches = new Map(); // 멀티터치 상태 저장

    // =========================================================================
    // ⭐ 🚨통신 핵심 로직 (Firebase)🚨 ⭐
    // =========================================================================

    // --- 1. 모바일 -> PC (명령 전송) ---
    async function sendCommandToFirestore(action, data = {}) {
        if (!SESSION_ID) return;

        if (action !== 'select_multi' && action !== 'control_one' && selectedDecoIds.length === 0) {
             console.warn("No item selected for action:", action);
             return;
        }
        
        const commandData = {
            ...data,
            ids: data.ids || selectedDecoIds 
        };

        const command = {
            action: action,
            data: commandData,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        try {
            await CONTROLLER_REF.set({ command: command }, { merge: true });
        } catch (error) {
            console.error("Error sending command to Firestore:", error);
        }
    }

    // --- 2. PC -> 모바일 (상태 수신) ---
    function listenForPCState() {
        CONTROLLER_REF.onSnapshot((doc) => {
            if (doc.exists && doc.data().pcState) {
                const state = doc.data().pcState;
                
                sceneInfoEl.textContent = `Scene ${state.scene} 연결됨`;
                currentDecoList = state.decoList || [];
                selectedDecoIds = state.selectedIds || [];

                updateTouchPads();

            } else {
                sceneInfoEl.textContent = "PC 연결 대기 중...";
                currentDecoList = [];
                selectedDecoIds = [];
                updateTouchPads();
            }
        }, (error) => {
            console.error("Error listening for PC state:", error);
            sceneInfoEl.textContent = "연결 오류!";
        });
    }

    // =========================================================================

    // --- 3. 터치패드 UI 업데이트 ---
    function updateTouchPads() {
        touchPadsWrapper.innerHTML = ''; 

        if (mainCanvasFrame.offsetWidth === 0) return; // 프레임이 그려지기 전이면 중단

        const frameWidth = mainCanvasFrame.offsetWidth;
        const frameHeight = mainCanvasFrame.offsetHeight;

        currentDecoList.forEach((deco, index) => {
            const pad = document.createElement('button');
            pad.classList.add('touch-pad');
            pad.id = `touch-pad-${deco.id}`;
            pad.dataset.id = deco.id;
            pad.title = `아이템 ${index + 1} 선택 및 이동`;

            // ⭐ [핵심] 90도 회전된 좌표 적용
            // 모바일 X (가로) = PC의 Y 좌표 (state.x_mobile)
            const pixelX = deco.x_mobile * frameWidth;
            // 모바일 Y (세로) = PC의 X 좌표 (state.y_mobile)
            const pixelY = deco.y_mobile * frameHeight;

            pad.style.left = `${pixelX}px`;
            pad.style.top = `${pixelY}px`;
            
            // 패드가 활성화 (PC에서 리스트를 받음)될 때 보이도록
            setTimeout(() => { pad.style.opacity = '1'; }, 10); 

            if (selectedDecoIds.includes(deco.id)) {
                pad.classList.add('selected');
            }

            // --- 4. 클릭 (선택/해제) 이벤트 리스너 ---
            pad.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault(); 
                
                const decoId = deco.id; 
                const isSelected = selectedDecoIds.includes(decoId);

                if (e.metaKey || e.ctrlKey) { // 다중 선택 (Ctrl/Cmd + 클릭)
                    if (isSelected) {
                        selectedDecoIds = selectedDecoIds.filter(id => id !== decoId);
                    } else {
                        selectedDecoIds.push(decoId);
                    }
                } else { // 단일 선택
                    if (isSelected && selectedDecoIds.length === 1) {
                        selectedDecoIds = []; // 이미 선택된거 다시 누르면 해제
                    } else {
                        selectedDecoIds = [decoId]; // 새로 선택
                    }
                }
                
                sendCommandToFirestore('select_multi', { ids: selectedDecoIds });
                
                // 로컬 UI 즉시 업데이트
                updateTouchPads(); 
            });

            touchPadsWrapper.appendChild(pad);
        });
        
        // --- 버튼 활성화/비활성화 ---
        const isSelected = selectedDecoIds.length > 0;
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.disabled = !isSelected;
        });
        deleteButton.disabled = !isSelected;
        controlGroupWrapper.classList.toggle('active', isSelected);
    } // --- updateTouchPads 끝 ---


    // --- 5. 멀티터치 이동 이벤트 핸들러 ---
    
    touchPadsWrapper.addEventListener('touchstart', (e) => {
        const frameRect = mainCanvasFrame.getBoundingClientRect();
        const frameWidth = frameRect.width;
        const frameHeight = frameRect.height;

        for (const touch of e.changedTouches) {
            const targetPad = touch.target.closest('.touch-pad');
            
            if (targetPad) {
                e.preventDefault(); // 터치패드 영역에서만 스크롤 방지
                const decoId = targetPad.dataset.id;
                
                activeTouches.set(touch.identifier, {
                    pad: targetPad,
                    decoId: decoId,
                    lastX: touch.clientX,
                    lastY: touch.clientY,
                    frameWidth: frameWidth,
                    frameHeight: frameHeight
                });
                targetPad.classList.add('active'); 
            }
        }
    }, { passive: false }); // 스크롤 방지를 위해 passive: false 설정

    touchPadsWrapper.addEventListener('touchmove', (e) => {
        if (activeTouches.size > 0) {
             e.preventDefault(); // 드래그 중 스크롤 방지
        }

        for (const touch of e.changedTouches) {
            const dragData = activeTouches.get(touch.identifier);

            if (dragData) {
                const { pad, decoId, lastX, lastY, frameWidth, frameHeight } = dragData;

                const dx = touch.clientX - lastX;
                const dy = touch.clientY - lastY;
                
                let currentPadLeft = parseFloat(pad.style.left);
                let currentPadTop = parseFloat(pad.style.top);
                
                let newPadLeft = currentPadLeft + dx;
                let newPadTop = currentPadTop + dy;

                // (경계 처리 로직 - 중심점 기준)
                newPadLeft = Math.max(0, Math.min(newPadLeft, frameWidth));
                newPadTop = Math.max(0, Math.min(newPadTop, frameHeight));

                pad.style.left = `${newPadLeft}px`;
                pad.style.top = `${newPadTop}px`;
                
                // ⭐ [핵심] 90도 회전된 정규화 좌표 전송
                // 모바일 X (가로)
                const newNormX = newPadLeft / frameWidth;
                // 모바일 Y (세로)
                const newNormY = newPadTop / frameHeight;

                const deco = currentDecoList.find(d => d.id === decoId);
                if (deco) { 
                    deco.x_mobile = newNormX; 
                    deco.y_mobile = newNormY; 
                }
                
                sendCommandToFirestore('control_one', { 
                    id: decoId, 
                    action: 'move',
                    x_mobile: newNormX, 
                    y_mobile: newNormY 
                });

                dragData.lastX = touch.clientX;
                dragData.lastY = touch.clientY;
            }
        }
    }, { passive: false }); 

    const touchEndOrCancel = (e) => {
        for (const touch of e.changedTouches) {
            const dragData = activeTouches.get(touch.identifier);
            if(dragData) {
                dragData.pad.classList.remove('active'); 
            }
            activeTouches.delete(touch.identifier);
        }
    };

    touchPadsWrapper.addEventListener('touchend', touchEndOrCancel);
    touchPadsWrapper.addEventListener('touchcancel', touchEndOrCancel);


    // --- 6. 버튼 이벤트 리스너 ---
    document.querySelectorAll('.control-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (selectedDecoIds.length === 0 || btn.disabled) return;
            const action = btn.dataset.action;
            const direction = btn.dataset.direction;
            
            sendCommandToFirestore('control_multi', { 
                action: action, 
                direction: direction 
            });
        });
    });

    // --- 7. 삭제 버튼 ---
    deleteButton.addEventListener('click', () => {
        if (selectedDecoIds.length === 0 || deleteButton.disabled) return;
        
        sendCommandToFirestore('delete_multi');
        
        selectedDecoIds = []; 
        updateTouchPads();
    });
    
    // --- 8. 초기화 ---
    listenForPCState();

    // 리사이즈 이벤트
    window.addEventListener('resize', () => {
        updateTouchPads();
    });
});
