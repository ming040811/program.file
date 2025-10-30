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
            ids: action === 'control_one' ? (data.id ? [data.id] : []) : (data.ids || selectedDecoIds)
        };

        if (action === 'control_one') {
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
                
                // ⭐ [수정] PC의 선택 상태를 다시 "수신"하도록 복구합니다.
                selectedDecoIds = state.selectedIds || [];

                // 2. 새 목록에 있는 아이템의 ID만 Set으로 만듭니다.
                const newDecoIds = new Set(currentDecoList.map(deco => deco.id));
                
                // 3. 로컬 selectedDecoIds를 "정리"합니다.
                //    (새 목록에 없는 "유령" ID는 제거)
                selectedDecoIds = selectedDecoIds.filter(id => newDecoIds.has(id));

                // 4. 정리된 상태로 UI를 업데이트합니다.
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
        if (mainCanvasFrame.offsetWidth === 0) return; // 프레임이 그려지기 전이면 중단

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
                
                // [선택 상태] PC에서 받은 (정리된) selectedDecoIds 기준으로 UI 업데이트
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

                // --- 4. 클릭 (선택/해제) 이벤트 리스너 (새 패드에만 추가) ---
                pad.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault(); 
                    
                    const decoId = deco.id; 
                    const isSelected = selectedDecoIds.includes(decoId);

                    // [선택 로직] 최대 2개 선택 (교체)
                    if (isSelected) {
                        selectedDecoIds = selectedDecoIds.filter(id => id !== decoId);
                    } else {
                        if (selectedDecoIds.length < 2) {
                            selectedDecoIds.push(decoId);
                        } else {
                            selectedDecoIds.shift(); // 가장 먼저 선택한 것 제거
                            selectedDecoIds.push(decoId); // 새 아이템 추가
                        }
                    }
                    
                    // 3. 변경된 선택 상태 PC로 전송
                    sendCommandToFirestore('select_multi', { ids: selectedDecoIds });
                    
                    // 4. 모든 패드의 'selected' UI 업데이트
                    document.querySelectorAll('.touch-pad').forEach(p => {
                        p.classList.toggle('selected', selectedDecoIds.includes(p.dataset.id));
                    });
                    
                    // 5. 하단 버튼 상태 업데이트
                    updateButtonDisabledState();
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

        // --- 3. 버튼 활성화/비활성화
        updateButtonDisabledState();

    } // --- updateTouchPads 끝 ---


    // --- 5. 멀티터치 이동 이벤트 핸들러 ---
    
    touchPadsWrapper.addEventListener('touchstart', (e) => {
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

    // ⭐ [성능/좌표 수정] touchmove 이벤트 핸들러 (스로틀링 적용)
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

                newPadLeft = Math.max(0, Math.min(newPadLeft, frameWidth));
                newPadTop = Math.max(0, Math.min(newPadTop, frameHeight));

                // 1. [성능] 로컬 UI는 즉시 업데이트 (부드러운 움직임)
                pad.style.left = `${newPadLeft}px`;
                pad.style.top = `${newPadTop}px`;
                
                dragData.lastX = touch.clientX;
                dragData.lastY = touch.clientY;

                // 2. [성능] 네트워크 전송은 50ms 마다 한번씩만 (스로틀링)
                if (dragData.isThrottled) {
                    continue; 
                }

                dragData.isThrottled = true;
                setTimeout(() => {
                    if (activeTouches.has(touch.identifier)) {
                        activeTouches.get(touch.identifier).isThrottled = false;
                    }
                }, 50); // 50ms
                

                // 3. [좌표] 정규화
                const mobileNormX = newPadLeft / frameWidth;  // 컨트롤러 좌(0) ~ 우(1)
                const mobileNormY = newPadTop / frameHeight; // 컨트롤러 위(0) ~ 아래(1)
                
                // [좌표 매핑]
                const logic_Site_TB = 1.0 - mobileNormX;
                const logic_Site_LR = mobileNormY;

                // 4. [성능] currentDecoList(로컬 상태)도 직접 업데이트 (깜박임 방지)
                const deco = currentDecoList.find(d => d.id === decoId);
                if (deco) { 
                    deco.x_mobile = logic_Site_TB;
                    deco.y_mobile = logic_Site_LR;
                }
                
                sendCommandToFirestore('control_one', { 
                    id: decoId, 
                    action: 'move',
                    x_mobile: logic_Site_TB, // PC의 x_mobile 필드에 사이트 상/하(Y) 로직 전송
                    y_mobile: logic_Site_LR  // PC의 y_mobile 필드에 사이트 좌/우(X) 로직 전송
                });
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
        
        document.querySelectorAll('.touch-pad.selected').forEach(pad => {
            pad.classList.remove('selected');
        });
        updateButtonDisabledState();
    });
    
    // --- 8. 초기화 ---
    listenForPCState();

    // 리사이즈 이벤트
    window.addEventListener('resize', () => {
        updateTouchPads();
    });
});
