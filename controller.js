document.addEventListener('DOMContentLoaded', () => {
    // 0. DOM 요소
    const mainCanvasFrame = document.querySelector('.main-canvas-frame');
    const touchPadsWrapper = document.querySelector('.touch-pads-wrapper');
    const deleteButton = document.getElementById('delete-selected-deco');
    const controlGroupWrapper = document.querySelector('.control-group-wrapper');
    const sceneInfoEl = document.querySelector('.scene-info');

    // 1. Firebase 연동
    // 'db' 객체는 controller.html의 <script> 태그에서 전역으로 생성되었습니다.
    if (typeof db === 'undefined') {
        sceneInfoEl.textContent = 'Firebase 연결 실패';
        console.error("Firebase 'db' 객체를 찾을 수 없습니다.");
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const SESSION_ID = urlParams.get('session');

    if (!SESSION_ID) {
        sceneInfoEl.textContent = '세션 ID 없음';
        console.error('세션 ID가 URL에 없습니다.');
        alert('잘못된 접근입니다. PC에서 QR 코드를 다시 스캔하세요.');
        return;
    }

    const CONTROLLER_REF = db.collection('controllers').doc(SESSION_ID);
    console.log("컨트롤러 연결됨. 세션 ID:", SESSION_ID);

    // 2. 상태 변수
    let currentDecoList = []; 
    let selectedDecoIds = []; 
    const activeTouches = new Map();

    // --- 3. Firebase 통신 (모바일 -> PC) ---
    async function sendCommandToFirestore(type, data = {}) {
        try {
            const command = {
                type: type,
                ...data,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            // 'command' 필드에 덮어쓰기
            await CONTROLLER_REF.set({ command: command }, { merge: true });
        } catch (error) {
            console.error("Error sending command:", error);
        }
    }

    // --- 4. Firebase 통신 (PC -> 모바일) ---
    function listenForPCState() {
        CONTROLLER_REF.onSnapshot((doc) => {
            if (doc.exists && doc.data().pcState) {
                const state = doc.data().pcState;
                
                // PC에서 보낸 정규화된(0~1) 좌표 리스트
                currentDecoList = state.decoList || []; 
                selectedDecoIds = state.selectedIds || [];
                sceneInfoEl.textContent = `Scene ${state.scene} 연결`;
                
                // UI 업데이트
                updateTouchPads();
            } else {
                sceneInfoEl.textContent = 'PC 연결 대기 중...';
            }
        }, (error) => {
            console.error("Error listening for PC state:", error);
            sceneInfoEl.textContent = '연결 오류';
        });
    }

    // --- 5. 터치패드 UI 업데이트 (기존 로직과 거의 동일) ---
    function updateTouchPads() {
        touchPadsWrapper.innerHTML = ''; 

        const frameWidth = mainCanvasFrame.offsetWidth;
        const frameHeight = mainCanvasFrame.offsetHeight;
        if (frameWidth === 0 || frameHeight === 0) return;

        currentDecoList.forEach((deco, index) => {
            const pad = document.createElement('button');
            pad.classList.add('touch-pad');
            pad.id = `touch-pad-${deco.id}`;
            pad.dataset.id = deco.id;
            pad.title = `아이템 ${index + 1} 선택 및 이동`;

            // 정규화된 좌표(0~1) -> 캔버스 픽셀 좌표로 변환
            const pixelX = deco.x * frameWidth;
            const pixelY = deco.y * frameHeight;

            pad.style.left = `${pixelX}px`;
            pad.style.top = `${pixelY}px`;
            pad.style.opacity = '1'; // active 클래스 대신 바로 표시

            if (selectedDecoIds.includes(deco.id)) {
                pad.classList.add('selected');
            }

            // --- 6. 클릭 (선택/해제) 이벤트 리스너 ---
            pad.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault(); 
                
                const decoId = deco.id; 
                const isSelected = selectedDecoIds.includes(decoId);

                if (isSelected) {
                    selectedDecoIds = selectedDecoIds.filter(id => id !== decoId);
                } else {
                    // 다중 선택 (최대 3개 - PC 제한과 동일하게)
                    if (selectedDecoIds.length < 3) {
                        selectedDecoIds.push(decoId);
                    } else {
                        // 3개 초과 시, 가장 오래된 것 빼고 새 것 추가
                        selectedDecoIds.shift(); 
                        selectedDecoIds.push(decoId);
                    }
                }
                
                // ⭐ [수정됨] PC로 선택 상태 전송
                sendCommandToFirestore('DECO_SELECT_MULTI', { ids: selectedDecoIds }); 
                
                // (PC로부터 상태가 다시 오겠지만, 즉각적인 반응을 위해 로컬에서도 UI 업데이트)
                updateTouchPads();
            });

            touchPadsWrapper.appendChild(pad);
        });
        
        // 버튼 활성화/비활성화
        const isSelected = selectedDecoIds.length > 0;
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.disabled = !isSelected;
        });
        deleteButton.disabled = !isSelected;
        controlGroupWrapper.classList.toggle('active', isSelected);
    } // --- updateTouchPads 끝 ---


    // --- 7. 멀티터치 이동 이벤트 핸들러 (기존 로직과 거의 동일) ---
    
    touchPadsWrapper.addEventListener('touchstart', (e) => {
        const frameRect = mainCanvasFrame.getBoundingClientRect();
        const frameWidth = frameRect.width;
        const frameHeight = frameRect.height;

        for (const touch of e.changedTouches) {
            const targetPad = touch.target.closest('.touch-pad');
            
            if (targetPad) {
                const decoId = targetPad.dataset.id;
                // '선택된' 아이템일 때만 드래그 시작
                if (selectedDecoIds.includes(decoId)) { 
                    activeTouches.set(touch.identifier, {
                        pad: targetPad,
                        decoId: decoId,
                        lastX: touch.clientX,
                        lastY: touch.clientY,
                        frameWidth: frameWidth,
                        frameHeight: frameHeight
                    });
                }
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

                // 캔버스 경계 체크 (기존 코드)
                const padHalf = pad.offsetWidth / 2;
                newPadLeft = Math.max(padHalf, Math.min(newPadLeft, frameWidth - padHalf));
                newPadTop = Math.max(padHalf, Math.min(newPadTop, frameHeight - padHalf));

                pad.style.left = `${newPadLeft}px`;
                pad.style.top = `${newPadTop}px`;
                
                // ⭐ [수정됨] PC로 정규화된 좌표 전송
                const newNormX = newPadLeft / frameWidth;
                const newNormY = newPadTop / frameHeight;

                const deco = currentDecoList.find(d => d.id === decoId);
                if (deco) { deco.x = newNormX; deco.y = newNormY; }
                
                sendCommandToFirestore('DECO_CONTROL', { id: decoId, action: 'move', x: newNormX, y: newNormY });

                dragData.lastX = touch.clientX;
                dragData.lastY = touch.clientY;
            }
        }
    }, { passive: false }); 

    const touchEndOrCancel = (e) => {
        for (const touch of e.changedTouches) {
            activeTouches.delete(touch.identifier);
        }
    };

    touchPadsWrapper.addEventListener('touchend', touchEndOrCancel);
    touchPadsWrapper.addEventListener('touchcancel', touchEndOrCancel);


    // --- 8. 버튼 이벤트 리스너 ---
    document.querySelectorAll('.control-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (selectedDecoIds.length === 0 || btn.disabled) return;
            const action = btn.dataset.action;
            const direction = btn.dataset.direction;
            
            // ⭐ [수정됨] PC로 명령 전송
            sendCommandToFirestore('DECO_CONTROL_MULTI', { 
                ids: selectedDecoIds, 
                action: action, 
                direction: direction 
            });
        });
    });

    // --- 9. 삭제 버튼 ---
    deleteButton.addEventListener('click', () => {
        if (selectedDecoIds.length === 0 || deleteButton.disabled) return;
        
        // ⭐ [수정됨] PC로 삭제 명령 전송
        sendCommandToFirestore('DECO_DELETE_MULTI', { ids: selectedDecoIds });
        
        selectedDecoIds = []; 
        updateTouchPads(); // 즉각적인 UI 반응
    });

    // --- 10. 초기 실행 ---
    // ⭐ [신규] PC 상태 수신 시작
    listenForPCState();

    // ⭐ [제거됨] 더미 데이터 로드 제거
    // request_dummy_list();

    // 리사이즈 시 터치패드 위치 재계산
    window.addEventListener('resize', () => {
        updateTouchPads();
    });
});
