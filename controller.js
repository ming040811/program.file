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
    let selectedDecoIds = []; // PC의 'pcState'에 의해 제어됨
    const activeTouches = new Map(); // 멀티터치 상태 저장

    // =========================================================================
    // ⭐ 🚨통신 핵심 로직 (Firebase)🚨 ⭐
    // =========================================================================

    // --- 1. 모바일 -> PC (명령 전송) ---
    async function sendCommandToFirestore(action, data = {}) {
        if (!SESSION_ID) return;

        // 'item_click'과 'control_one'은 selectedDecoIds가 없어도 전송 허용
        if (action !== 'item_click' && action !== 'control_one' && selectedDecoIds.length === 0) {
             console.warn("No item selected for action:", action);
             return;
        }
        
        const commandData = {
            ...data,
            ids: (action === 'control_one' || action === 'item_click') ? (data.id ? [data.id] : []) : (data.ids || selectedDecoIds)
        };

        if (action === 'control_one' || action === 'item_click') {
            commandData.id = data.id;
        }

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
                selectedDecoIds = state.selectedIds || []; // PC의 상태를 덮어쓰기

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
    // ⭐ 🚨 하단 버튼 상태 업데이트 로직 (분리) 🚨 ⭐
    // =========================================================================
    function updateButtonDisabledState() {
        const isSelected = selectedDecoIds.length > 0;
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.disabled = !isSelected;
        });
        deleteButton.disabled = !isSelected;
        controlGroupWrapper.classList.toggle('active', isSelected);
    }


    // =========================================================================
    // ⭐ 🚨 DOM Reconciliation (비교/조정) 방식으로 수정된 함수 🚨 ⭐
    // =========================================================================
    function updateTouchPads() {
        if (mainCanvasFrame.offsetWidth === 0) return; 

        const frameWidth = mainCanvasFrame.offsetWidth;
        const frameHeight = mainCanvasFrame.offsetHeight;
        const draggingIds = new Set(Array.from(activeTouches.values()).map(data => data.decoId));
        const existingPads = new Map();
        
        touchPadsWrapper.querySelectorAll('.touch-pad').forEach(pad => {
            existingPads.set(pad.dataset.id, pad);
        });

        // --- 1. currentDecoList (새 상태)를 기준으로 DOM 업데이트 및 추가 ---
        currentDecoList.forEach((deco, index) => {
            let pad = existingPads.get(deco.id);

            // [좌표 매핑]
            const mobileNormY = deco.y_mobile; 
            const mobileNormX = 1.0 - deco.x_mobile;
            const pixelX = mobileNormX * frameWidth;
            const pixelY = mobileNormY * frameHeight;

            if (pad) {
                // 1a. 기존 패드 업데이트
                existingPads.delete(deco.id); 

                if (!draggingIds.has(deco.id)) {
                    pad.style.left = `${pixelX}px`;
                    pad.style.top = `${pixelY}px`;
                }
                
                pad.classList.toggle('selected', selectedDecoIds.includes(deco.id));

            } else {
                // 1b. 새 패드 생성
                pad = document.createElement('button');
                pad.classList.add('touch-pad');
                pad.id = `touch-pad-${deco.id}`;
                pad.dataset.id = deco.id;
                pad.title = `아이템 ${index + 1} 선택 및 이동`;

                pad.style.left = `${pixelX}px`;
                pad.style.top = `${pixelY}px`;
                
                if (selectedDecoIds.includes(deco.id)) {
                    pad.classList.add('selected');
                }

                // 'touchend'에서 탭(Tap)을 직접 감지하므로 'click' 리스너 없음

                touchPadsWrapper.appendChild(pad);
                setTimeout(() => { pad.style.opacity = '1'; }, 10); 
            }
        });

        // --- 2. 맵에 남아있는 패드 (stale) DOM에서 삭제 ---
        existingPads.forEach(pad => {
            pad.style.opacity = '0';
            setTimeout(() => { pad.remove(); }, 300);
        });

        // --- 3. 버튼 활성화/비활성화 (PC가 준 상태 기준) ---
        updateButtonDisabledState();

    } // --- updateTouchPads 끝 ---


    // --- 5. 멀티터치 이벤트 핸들러 ---
    
    // 'touchstart'는 '탭' 감지를 위해 *모든* 패드 터치를 등록
    touchPadsWrapper.addEventListener('touchstart', (e) => {
        const frameRect = mainCanvasFrame.getBoundingClientRect();
        const frameWidth = frameRect.width;
        const frameHeight = frameRect.height;

        for (const touch of e.changedTouches) {
            const targetPad = touch.target.closest('.touch-pad');
            
            if (targetPad) {
                // e.preventDefault(); // (제거된 상태 유지)

                const decoId = targetPad.dataset.id;
                
                activeTouches.set(touch.identifier, {
                    pad: targetPad,
                    decoId: decoId,
                    lastX: touch.clientX,
                    lastY: touch.clientY,
                    frameWidth: frameWidth,
                    frameHeight: frameHeight,
                    isThrottled: false,
                    isDragging: false // 탭/드래그 구분을 위한 플래그
                });

                // 시각적 피드백: 선택된 아이템을 터치했을 때만 'active'
                if (selectedDecoIds.includes(decoId)) {
                    targetPad.classList.add('active'); 
                }
            }
        }
    }, { passive: false }); 

    // 'touchmove'는 'isDragging' 플래그를 true로 설정
    touchPadsWrapper.addEventListener('touchmove', (e) => {
        if (activeTouches.size > 0) {
             e.preventDefault(); // 드래그 시작 시 스크롤 방지
        }

        for (const touch of e.changedTouches) {
            const dragData = activeTouches.get(touch.identifier);

            if (dragData) {
                // 손가락이 움직였으므로 '드래그'로 확정
                dragData.isDragging = true; 

                // 선택된 아이템만 드래그되도록 보장
                if (!selectedDecoIds.includes(dragData.decoId)) {
                    continue; 
                }

                // --- (이하 드래그 로직) ---
                const { pad, decoId, lastX, lastY, frameWidth, frameHeight } = dragData;
                const dx = touch.clientX - lastX;
                const dy = touch.clientY - lastY;
                let currentPadLeft = parseFloat(pad.style.left);
                let currentPadTop = parseFloat(pad.style.top);
                let newPadLeft = currentPadLeft + dx;
                let newPadTop = currentPadTop + dy;
                newPadLeft = Math.max(0, Math.min(newPadLeft, frameWidth));
                newPadTop = Math.max(0, Math.min(newPadTop, frameHeight));

                pad.style.left = `${newPadLeft}px`;
                pad.style.top = `${newPadTop}px`;
                dragData.lastX = touch.clientX;
                dragData.lastY = touch.clientY;

                if (dragData.isThrottled) {
                    continue; 
                }

                dragData.isThrottled = true;
                setTimeout(() => {
                    if (activeTouches.has(touch.identifier)) {
                        activeTouches.get(touch.identifier).isThrottled = false;
                    }
                }, 30); // ⭐️⭐️⭐️ 50ms -> 30ms로 수정 (성능 향상) ⭐️⭐️⭐️
                
                const mobileNormX = newPadLeft / frameWidth;
                const mobileNormY = newPadTop / frameHeight;
                const logic_Site_TB = 1.0 - mobileNormX;
                const logic_Site_LR = mobileNormY;

                const deco = currentDecoList.find(d => d.id === decoId);
                if (deco) { 
                    deco.x_mobile = logic_Site_TB;
                    deco.y_mobile = logic_Site_LR;
                }
                
                sendCommandToFirestore('control_one', { 
                    id: decoId, 
                    action: 'move',
                    x_mobile: logic_Site_TB, 
                    y_mobile: logic_Site_LR  
                });
            }
        }
    }, { passive: false }); 

    // 'touchend'는 'isDragging' 플래그를 확인하여 '탭'을 감지
    const touchEndOrCancel = (e) => {
        for (const touch of e.changedTouches) {
            const dragData = activeTouches.get(touch.identifier);

            if(dragData) {
                dragData.pad.classList.remove('active'); 

                // [탭(Tap) 감지 로직]
                // 드래그되지 않았다면(isDragging == false) '탭'으로 간주
                if (dragData.isDragging === false) {
                    sendCommandToFirestore('item_click', { id: dragData.decoId });
                }
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
    });
    
    // --- 8. 초기화 ---
    listenForPCState();

    // 리사이즈 이벤트
    window.addEventListener('resize', () => {
        updateTouchPads();
    });
});
