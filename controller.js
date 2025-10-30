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

        // 'select_multi' 외의 액션은 선택된 아이템이 있어야 함
        if (action !== 'select_multi' && selectedDecoIds.length === 0) {
             // 'control_one' (이동)은 예외로 둬야 함 (activeTouches 기반)
             if(action !== 'control_one') {
                 console.warn("No item selected for action:", action);
                 return;
             }
        }
        
        // 'control_one' (이동)은 data에 id가 포함되어 옴
        // 'control_multi', 'delete_multi'는 selectedDecoIds를 사용
        const commandData = {
            ...data,
            ids: data.ids || selectedDecoIds // 데이터에 ids가 없으면 전역 selectedDecoIds 사용
        };

        const command = {
            action: action,
            data: commandData,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        try {
            // command 필드를 덮어씁니다.
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

                // 상태 수신 후 즉시 터치패드 UI 업데이트
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
            pad.style.opacity = '1';

            if (selectedDecoIds.includes(deco.id)) {
                pad.classList.add('selected');
            }

            // --- 4. 클릭 (선택/해제) 이벤트 리스너 ---
            pad.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault(); 
                
                const decoId = deco.id; 
                const isSelected = selectedDecoIds.includes(decoId);

                // (멀티 셀렉트 로직은 기존과 동일)
                if (isSelected) {
                    selectedDecoIds = selectedDecoIds.filter(id => id !== decoId);
                } else {
                    if (selectedDecoIds.length < 3) { // 최대 3개
                        selectedDecoIds.push(decoId);
                    } else {
                        selectedDecoIds.shift(); 
                        selectedDecoIds.push(decoId);
                    }
                }
                
                // ❗️ [수정됨] postMessage -> sendCommandToFirestore
                sendCommandToFirestore('select_multi', { ids: selectedDecoIds });
                
                // (참고: PC가 상태를 다시 보내주므로 여기서 updateTouchPads()를 호출할 필요는 없지만,
                // 즉각적인 반응성을 위해 로컬에서 바로 갱신)
                updateTouchPads(); 
            });

            touchPadsWrapper.appendChild(pad);
        });
        
        // --- 버튼 활성화/비활성화 (기존과 동일) ---
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
                const decoId = targetPad.dataset.id;
                
                // ⭐ [수정됨] 드래그는 '선택된' 아이템이 아니어도 가능하도록 함
                // (단, 드래그 시작 시 해당 아이템을 선택 상태로 만들 수 있음 - 선택사항)
                // if (selectedDecoIds.includes(decoId)) { // 이 검사 제거
                
                // 터치 ID를 키로 사용하여 정보 저장
                activeTouches.set(touch.identifier, {
                    pad: targetPad,
                    decoId: decoId,
                    lastX: touch.clientX,
                    lastY: touch.clientY,
                    frameWidth: frameWidth,
                    frameHeight: frameHeight
                });
                targetPad.classList.add('active'); // 드래그 중임을 시각적으로 표시
                // }
            }
        }
    }, { passive: false });

    touchPadsWrapper.addEventListener('touchmove', (e) => {
        e.preventDefault(); 

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

                // (경계 처리 로직은 기존과 동일)
                const padHalf = pad.offsetWidth / 2;
                newPadLeft = Math.max(padHalf, Math.min(newPadLeft, frameWidth - padHalf));
                newPadTop = Math.max(padHalf, Math.min(newPadTop, frameHeight - padHalf));

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
                
                // ❗️ [수정됨] postMessage -> sendCommandToFirestore
                // PC가 90도 회전해서 처리할 수 있도록 모바일의 x, y를 그대로 보냄
                sendCommandToFirestore('control_one', { 
                    id: decoId, 
                    action: 'move', // 'move' 액션은 PC의 'control_one' 핸들러가 인식
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
                dragData.pad.classList.remove('active'); // 시각적 표시 제거
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
            
            // ❗️ [수정됨] postMessage -> sendCommandToFirestore
            sendCommandToFirestore('control_multi', { 
                // ids: selectedDecoIds (자동 포함됨)
                action: action, 
                direction: direction 
            });
        });
    });

    // --- 7. 삭제 버튼 ---
    deleteButton.addEventListener('click', () => {
        if (selectedDecoIds.length === 0 || deleteButton.disabled) return;
        
        // ❗️ [수정됨] postMessage -> sendCommandToFirestore
        sendCommandToFirestore('delete_multi', { 
            /* ids: selectedDecoIds (자동 포함됨) */ 
        });
        
        selectedDecoIds = []; 
        updateTouchPads();
    });

    // --- 8. 메시지 수신 (제거) ---
    // window.addEventListener('message', ...); (제거)

    // --- 9. 초기화 ---
    // window.onload = ... (제거)
    
    // PC 상태 수신 시작
    listenForPCState();

    // 리사이즈 이벤트
    window.addEventListener('resize', () => {
        updateTouchPads();
    });
});
