document.addEventListener('DOMContentLoaded', () => {
    // ... (db 체크, 세션 ID 체크는 이전과 동일) ...
    if (typeof db === 'undefined') {
        console.error("Firebase Firestore 'db' is not initialized.");
        alert("Firebase 연결 실패! HTML을 확인하세요.");
        return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const SESSION_ID = urlParams.get('session');
    if (!SESSION_ID) {
        alert("유효한 세션 ID가 없습니다. QR 코드를 다시 스캔하세요.");
        document.body.innerHTML = "<h1>연결 실패</h1><p>유효한 세션 ID가 없습니다. PC의 QR 코드를 다시 스캔하세요.</p>";
        return;
    }
    const CONTROLLER_REF = db.collection('controllers').doc(SESSION_ID);

    // ... (DOM 요소 정의는 이전과 동일) ...
    const mainCanvasFrame = document.querySelector('.main-canvas-frame');
    const touchPadsWrapper = document.querySelector('.touch-pads-wrapper');
    const deleteButton = document.getElementById('delete-selected-deco');
    const controlGroupWrapper = document.querySelector('.control-group-wrapper');
    const sceneInfoEl = document.querySelector('.scene-info');


    let currentDecoList = []; 
    let selectedDecoIds = []; // ⭐ 이 변수는 이제 PC가 보내주는 'pcState'에 의해서만 업데이트됩니다.
    const activeTouches = new Map(); 

    // =========================================================================
    // ⭐ 🚨통신 핵심 로직 (Firebase)🚨 ⭐
    // =========================================================================

    // --- 1. 모바일 -> PC (명령 전송) ---
    async function sendCommandToFirestore(action, data = {}) {
        if (!SESSION_ID) return;

        // ⭐ [수정] 'select_multi' 대신 'item_click'을 허용합니다.
        // 'item_click'과 'control_one'은 selectedDecoIds가 없어도 전송 허용
        if (action !== 'item_click' && action !== 'control_one' && selectedDecoIds.length === 0) {
             console.warn("No item selected for action:", action);
             return;
        }
        
        const commandData = {
            ...data,
            // [수정] 'item_click'은 data.id를 사용합니다.
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
                
                // 1. 새 아이템 목록을 받습니다.
                currentDecoList = state.decoList || []; 
                
                // 2. ⭐ [중요] PC가 보낸 'selectedIds'를 로컬 'selectedDecoIds'에 덮어씁니다.
                // 이것이 컨트롤러의 유일한 '상태'가 됩니다.
                selectedDecoIds = state.selectedIds || [];

                // 3. UI를 업데이트합니다.
                updateTouchPads();

            } else {
                sceneInfoEl.textContent = "PC 연결 대기 중...";
                currentDecoList = [];
                selectedDecoIds = []; // 연결이 끊기면 리셋
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
        // ⭐ 이 함수는 이제 PC에서 받은 'selectedDecoIds' 상태를 기반으로 작동합니다.
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

            // [좌표 매핑] (이전과 동일)
            const mobileNormY = deco.y_mobile; 
            const mobileNormX = 1.0 - deco.x_mobile;
            const pixelX = mobileNormX * frameWidth;
            const pixelY = mobileNormY * frameHeight;

            if (pad) {
                // 1a. 기존 패드 업데이트
                existingPads.delete(deco.id); 

                // ⭐ [중요] 드래그 중인 패드는 PC의 'pcState'에 의해 덮어쓰이지 않습니다.
                // (드래그가 끝나면 PC의 최종 위치로 자동 동기화됩니다)
                if (!draggingIds.has(deco.id)) {
                    pad.style.left = `${pixelX}px`;
                    pad.style.top = `${pixelY}px`;
                }
                
                // [선택 상태] PC에서 받은 selectedDecoIds 기준으로 UI 업데이트
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

                // --- 4. [⭐️⭐️⭐️ 수정됨 ⭐️⭐️⭐️] 클릭 (선택/해제) 이벤트 리스너 ---
                pad.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault(); 
                    
                    const decoId = deco.id; 
                    
                    // ⭐ [수정]
                    // 컨트롤러는 '클릭'만 PC에 알리고, 선택/해제 로직은 PC가 담당합니다.
                    sendCommandToFirestore('item_click', { id: decoId });
                    
                    // ⭐ [제거]
                    // 로컬 selectedDecoIds를 직접 수정하지 않습니다 (레이스 컨디션 방지)
                    // 로컬 UI를 즉시 업데이트하지 않습니다. (PC의 응답(pcState)을 기다립니다)
                });

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


    // --- 5. 멀티터치 이동 이벤트 핸들러 ---
    // (이 코드는 이전과 동일합니다 - 로컬 UI를 부드럽게 업데이트합니다)
    
    touchPadsWrapper.addEventListener('touchstart', (e) => {
        // ... (내용 동일) ...
        const frameRect = mainCanvasFrame.getBoundingClientRect();
        const frameWidth = frameRect.width;
        const frameHeight = frameRect.height;
        for (const touch of e.changedTouches) {
            const targetPad = touch.target.closest('.touch-pad');
            if (targetPad && selectedDecoIds.includes(targetPad.dataset.id)) {
                e.preventDefault(); 
                const decoId = targetPad.dataset.id;
                activeTouches.set(touch.identifier, {
                    pad: targetPad,
                    decoId: decoId,
                    lastX: touch.clientX,
                    lastY: touch.clientY,
                    frameWidth: frameWidth,
                    frameHeight: frameHeight,
                    isThrottled: false
                });
                targetPad.classList.add('active'); 
            }
        }
    }, { passive: false });

    touchPadsWrapper.addEventListener('touchmove', (e) => {
        // ... (내용 동일 - 50ms 스로틀링, 좌표 매핑, control_one 전송) ...
        if (activeTouches.size > 0) {
             e.preventDefault(); 
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
                }, 50); 
                
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

    const touchEndOrCancel = (e) => {
        // ... (내용 동일) ...
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
    // (이 코드는 이전과 동일합니다 - 명령만 전송)
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

    // --- 7. [⭐️⭐️⭐️ 수정됨 ⭐️⭐️⭐️] 삭제 버튼 ---
    deleteButton.addEventListener('click', () => {
        if (selectedDecoIds.length === 0 || deleteButton.disabled) return;
        
        // ⭐ [수정] 삭제 명령만 전송합니다.
        sendCommandToFirestore('delete_multi');
        
        // ⭐ [제거]
        // 로컬 selectedDecoIds를 즉시 비우지 않습니다.
        // PC가 업데이트된 'pcState'를 보내줄 때까지 기다립니다.
        // (버튼은 PC의 응답이 올 때까지 잠시 활성화 상태로 남아있을 수 있습니다)
    });
    
    // --- 8. 초기화 ---
    listenForPCState();

    // 리사이즈 이벤트
    window.addEventListener('resize', () => {
        updateTouchPads();
    });
});
