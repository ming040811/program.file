document.addEventListener('DOMContentLoaded', () => {
    // Firebase 전역 객체 'db'는 index.html의 <script> 태그에서 초기화되었습니다.
    if (typeof db === 'undefined') {
        console.error("Firebase Firestore is not initialized. Make sure 'db' is available.");
        // alert()는 사용하지 않습니다. 콘솔 로그로 대체합니다.
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
            // 새로 생성된 ID를 현재 URL에 추가 (페이지 새로고침 시에도 유지)
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
        // PC 모드가 아니면 동기화 실행 안 함
        if (isControllerMode) return; 

        const decoList = storyData[currentScene].decorations.slice(0, 3).map((deco, index) => ({
            id: deco.id,
            index: index + 1
        }));
        
        const state = {
            scene: currentScene,
            selectedId: selectedDecoId,
            decoList: decoList,
            timestamp: firebase.firestore.FieldValue.serverTimestamp() // Firestore 타임스탬프
        };

        try {
            await CONTROLLER_REF.set({ 
                pcState: state 
            }, { merge: true }); // pcState 필드만 업데이트
        } catch (error) {
            console.error("Error syncing state to Firestore:", error);
        }
    }
    
    // 모바일 -> PC (조작 명령 수신 리스너)
    let lastCommandTimestamp = 0; // 중복 실행 방지를 위한 타임스탬프

    function listenForControlCommands() {
        // PC 모드에서만 명령을 수신함
        if (isControllerMode) return; 

        // Firestore의 특정 문서(세션 ID)를 실시간 감시
        CONTROLLER_REF.onSnapshot((doc) => {
            if (doc.exists && doc.data().command) {
                const command = doc.data().command;
                
                // 명령의 타임스탬프를 확인하여 중복 실행 방지
                if (command.timestamp && command.timestamp.toMillis() > lastCommandTimestamp) {
                    lastCommandTimestamp = command.timestamp.toMillis();
                    
                    // 명령 처리
                    handleControllerControl(command.id, command.action, command.data);

                    // 명령 처리 후, Firestore에서 command 필드를 삭제하여 중복 실행 방지
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
    // =========================================================================
    if (isControllerMode) {
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
                // 'select' 액션은 activeDecoId가 없어도 전송 가능해야 함
                return;
            }

            // 'select' 액션은 data.newId를 id로 사용하고, 그 외는 activeDecoId 사용
            let commandId = (action === 'select' && data.newId) ? data.newId : activeDecoId;
            
            // 'select'가 아닌데 commandId가 없으면 리턴
            if (!commandId) {
                 return;
            }

            const command = {
                id: commandId,
                action: action,
                data: data,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            try {
                // command 필드를 덮어씁니다.
                await CONTROLLER_REF.set({ command: command }, { merge: true });
            } catch (error) {
                console.error("Error sending command to Firestore:", error);
            }
        }

        // 3. 컨트롤러 이벤트 리스너 설정
        
        // 일반 버튼 (회전, 확대/축소, 반전, 삭제)
        document.querySelectorAll('#control-buttons .ctrl-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                
                if (action.includes('rotate')) {
                    sendCommandToFirestore('rotate', { direction: action.includes('left') ? 'LEFT' : 'RIGHT' });
                } else if (action.includes('scale')) {
                    sendCommandToFirestore('scale', { direction: action.includes('up') ? 'UP' : 'DOWN' });
                } else if (action === 'flip') {
                    sendCommandToFirestore('flip');
                } else if (action === 'delete') {
                    sendCommandToFirestore('delete');
                }
            });
        });

        // 아이템 선택 버튼 (PC에 선택 명령 전송)
        selectionArea.addEventListener('click', (e) => {
            if (e.target.classList.contains('ctrl-deco-btn')) {
                const newId = e.target.dataset.id;
                // PC에 선택 명령을 보내서 PC의 selectedDecoId를 변경
                sendCommandToFirestore('select', { newId: newId });
            }
        });
        
        // 터치패드 드래그 (Nudge)
        let isDragging = false;
        let startX, startY;
        let isTouch = false;

        // ⭐ 속도 최적화를 위한 변수 추가 (Throttling)
        let lastNudgeTime = 0;
        const NUDGE_INTERVAL = 50; // 50ms (초당 20번)
        // ⭐ --- 여기까지 ---

        const startDrag = (e) => {
            if (!activeDecoId) return;
            e.preventDefault();
            isDragging = true;
            startX = isTouch ? e.touches[0].clientX : e.clientX;
            startY = isTouch ? e.touches[0].clientY : e.clientY;
            if (!isTouch) touchpad.style.cursor = 'grabbing';
        };

        const onDrag = (e) => {
            if (!isDragging) return;
            e.preventDefault();

            // ⭐ 속도 최적화: 50ms 이내의 이벤트는 무시
            const now = Date.now();
            if (now - lastNudgeTime < NUDGE_INTERVAL) {
                return; 
            }
            lastNudgeTime = now;
            // ⭐ --- 여기까지 ---
            
            const clientX = isTouch ? e.touches[0].clientX : e.clientX;
            const clientY = isTouch ? e.touches[0].clientY : e.clientY;

            const dx = clientX - startX;
            const dy = clientY - startY;

            // PC로 NUDGE 명령 전송 (미세 조정을 위해 5로 나눔)
            sendCommandToFirestore('nudge', { dx: dx / 5, dy: dy / 5 });
            
            // 시작점을 현재 위치로 업데이트하여 연속적인 명령 전송
            startX = clientX;
            startY = clientY;
        };

        const endDrag = () => {
            if (isDragging) {
                isDragging = false;
                if (!isTouch) touchpad.style.cursor = 'grab';
            }
        };

        // PC/마우스 환경
        touchpad.addEventListener('mousedown', (e) => {
            isTouch = false;
            startDrag(e);
        });
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', endDrag);

        // 모바일 환경
        touchpad.addEventListener('touchstart', (e) => {
            isTouch = true;
            if (e.touches.length === 1) startDrag(e);
        });
        document.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) onDrag(e);
        });
        document.addEventListener('touchend', endDrag);
        
        // 4. PC 상태 수신 시작
        listenForPCState();
        
        return; // 메인 사이트의 나머지 로직 실행 중단
    }

    // =========================================================================
    // ⭐ PC 메인 웹사이트 모드 (isControllerMode: false) 로직 ⭐
    // =========================================================================
    
    // PC 모드에서는 명령 수신을 위한 리스너를 즉시 시작
    listenForControlCommands(); 
    
    // --- ⭐ 컨트롤러 창 열기 이벤트 리스너 (QR 코드 표시로 변경) ⭐ ---
    if (openControllerBtn) {
        openControllerBtn.addEventListener('click', () => {
            if (qrModal) qrModal.style.display = 'flex';
            
            // 현재 URL에서 쿼리스트링 제거 후, session ID와 mode=controller 추가
            const currentUrl = window.location.href.split('?')[0]; 
            const controllerUrl = `${currentUrl}?session=${SESSION_ID}&mode=controller`;

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
            // PC 상태를 Firestore에 최초 동기화 (모바일에서 연결을 기다리게 함)
            syncStateToFirestore(); 
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
        syncStateToFirestore(); // 상태 변경 시 컨트롤러에 동기화
    }

    // --- ⭐ [수정됨] 2-1. 아이템 스타일만 가볍게 업데이트하는 함수 ---
    function updateElementStyle(decoData) {
        const element = document.getElementById(decoData.id);
        if (!element) return;

        element.style.left = decoData.x + 'px';
        element.style.top = decoData.y + 'px';
        element.style.width = decoData.width + 'px';
        element.style.height = decoData.height + 'px';
        element.style.transform = `rotate(${decoData.rotation}deg)`;

        const img = element.querySelector('img');
        if (img) {
            img.style.transform = `scaleX(${decoData.scaleX})`;
        }
    }

    // --- ⭐ [수정됨] 2-2. PC 상태 동기화/저장을 위한 Throttling ---
    let pcUpdateTimer = null;
    const PC_UPDATE_INTERVAL = 500; // 0.5초마다 썸네일/상태 동기화

    function requestPcUpdate() {
        if (pcUpdateTimer) return; // 이미 업데이트 요청이 예약됨

        pcUpdateTimer = setTimeout(() => {
            syncStateToFirestore(); // 0.5초마다 컨트롤러로 상태 전송
            updateThumbnail(currentScene); // 0.5초마다 썸네일 업데이트
            pcUpdateTimer = null;
        }, PC_UPDATE_INTERVAL);
    }


    // --- 3. 컨트롤러 조작 명령 처리 함수 ---
    // PC에서 직접 실행하거나, 모바일에서 온 명령을 여기서 처리합니다.
    function handleControllerControl(id, action, data) {
        let decoData;
        
        // 모바일에서 보낸 ID가 현재 선택된 아이템이 아니더라도, 해당 아이템을 조작합니다.
        if (action === 'select') {
            selectItem(data.newId);
            return;
        }

        // 모바일에서 보낸 ID로 아이템을 선택하고 조작
        if (id && selectedDecoId !== id) {
             selectItem(id);
        }
        
        // 선택 해제 후 삭제 명령이 올 수 있으므로 selectedDecoId를 다시 확인
        if (selectedDecoId === null) return;
        
        decoData = storyData[currentScene].decorations.find(d => d.id === selectedDecoId);
        if (!decoData) return;

        const step = { move: 1, rotate: 5, scale: 0.02 }; // Nudge에 맞춰 move step을 줄였습니다.
        // let updated = false; // ⭐ 삭제: 이 로직은 더 이상 필요 없음

        if (action === 'nudge') {
            const dx = data.dx || 0;
            const dy = data.dy || 0;
            
            // 1. 데이터 업데이트
            decoData.x += dx;
            decoData.y += dy;
            // 2. ⭐ [수정] DOM 경량 업데이트 (renderScene 대신)
            updateElementStyle(decoData);
            // 3. ⭐ [추가] 0.5초 뒤 썸네일/상태 동기화 요청
            requestPcUpdate();
            
        } else if (action === 'rotate') {
            const direction = data.direction;
            if (direction === 'LEFT') { decoData.rotation -= step.rotate; }
            else if (direction === 'RIGHT') { decoData.rotation += step.rotate; }
            // 2. ⭐ [수정] DOM 경량 업데이트
            updateElementStyle(decoData);
            // 3. ⭐ [추가] 0.5초 뒤 썸네일/상태 동기화 요청
            requestPcUpdate();
            
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
                
                // 2. ⭐ [수정] DOM 경량 업데이트
                updateElementStyle(decoData);
                // 3. ⭐ [추가] 0.5초 뒤 썸네일/상태 동기화 요청
                requestPcUpdate();
            }
        } else if (action === 'flip') {
            decoData.scaleX *= -1;
            // 2. ⭐ [수정] DOM 경량 업데이트
            updateElementStyle(decoData);
            // 3. ⭐ [추가] 0.5초 뒤 썸네일/상태 동기화 요청
            requestPcUpdate();

        } else if (action === 'delete') {
            const index = storyData[currentScene].decorations.findIndex(d => d.id === id);
            if (index > -1) {
                storyData[currentScene].decorations.splice(index, 1);
                const element = document.getElementById(id);
                if (element) element.remove();
                selectItem(null); // 삭제 후 선택 해제 및 동기화 (즉시 실행)
                updateThumbnail(currentScene); // 썸네일 즉시 업데이트
                return; 
            }
        }

        // ⭐ 삭제: 이 블록이 깜빡임의 원인이었음
        /*
        if (updated) {
            renderScene(currentScene); 
        }
        */
    }

    // --- 4. 장식 아이템 추가 이벤트 핸들러 (PC에서만 작동) ---
    document.querySelectorAll('.asset-item[data-type="decoration"]').forEach(item => {
        item.addEventListener('click', () => {
            if (storyData[currentScene].decorations.length >= 3) {
                // alert() 대신 console.warn 사용
                console.warn("장식 아이템은 최대 3개까지만 추가할 수 있습니다.");
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
            renderScene(currentScene); // ❗️ 아이템 추가 시에는 전체 렌더링 (정상)
            selectItem(newDeco.id);
        });
    });


    // --- 5. 씬 렌더링 함수 ---
    // (이 함수는 이제 씬 전환 / 아이템 추가/삭제 시에만 호출됨)
    function renderScene(sceneNumber) {
        if (!canvas) return; // canvas가 없으면 함수 종료
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
        syncStateToFirestore(); // 렌더링 후 상태 동기화
    }

    // --- 6. 장식 요소 생성 함수 ---
    function createDecorationElement(decoData) {
        if (!canvas) return; // canvas가 없으면 함수 종료
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
        // ❗️ 이미지 경로 확인! ❗️
        img.onerror = function() { 
            img.src = `https://placehold.co/${Math.round(decoData.width)}x${Math.round(decoData.height)}/eee/ccc?text=이미지+로드+실패`;
        };
        img.style.transform = `scaleX(${decoData.scaleX})`;

        const controls = document.createElement('div');
        controls.className = 'controls';
        // ❗️ 이미지 경로 확인! ❗️
        controls.innerHTML = `<button class="flip" title="좌우반전"><img src="img/좌우반전.png" alt="좌우반전" onerror="this.parentNode.innerHTML='반전'"></button>
                              <button class="delete" title="삭제"><img src="img/휴지통.png" alt="삭제" onerror="this.parentNode.innerHTML='삭제'"></button>`;
        
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
        if (!decoData) return; // 데이터 못찾으면 중단

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
            if (verticalGuide) verticalGuide.style.display = 'none';
            if (horizontalGuide) horizontalGuide.style.display = 'none';

            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;

            const snapThreshold = 5; 
            
            if (!canvas) return;
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
                if (verticalGuide) {
                    verticalGuide.style.left = `${canvasCenterX}px`;
                    verticalGuide.style.display = 'block';
                }
                snappedX = true;
            }

            // 세로 중앙 스냅
            if (Math.abs(elementCenterY - canvasCenterY) < snapThreshold) {
                newTop = canvasCenterY - elementHeight / 2;
                if (horizontalGuide) {
                    horizontalGuide.style.top = `${canvasCenterY}px`;
                    horizontalGuide.style.display = 'block';
                }
                snappedY = true;
            }

            if (!snappedX && verticalGuide) verticalGuide.style.display = 'none';
            if (!snappedY && horizontalGuide) horizontalGuide.style.display = 'none';
            
            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;

            if (verticalGuide) verticalGuide.style.display = 'none';
            if (horizontalGuide) horizontalGuide.style.display = 'none';

            decoData.x = element.offsetLeft;
            decoData.y = element.offsetTop;
            updateThumbnail(currentScene); // PC 드래그 종료 시 썸네일/동기화 (즉시 실행)
            syncStateToFirestore();
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

                if (!canvas) return;
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
                updateThumbnail(currentScene); // PC 리사이즈 종료 시 썸네일/동기화 (즉시 실행)
                syncStateToFirestore();
            };
        }

        // 회전 (로테이터 핸들)
        const rotator = element.querySelector('.rotator');
        if (rotator) {
            rotator.onmousedown = function(e) {
                e.preventDefault(); e.stopPropagation();
                const rect = element.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
                let startRotation = decoData.rotation;

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
                    // ❗️[수정] 데이터만 업데이트하고 동기화는 requestPcUpdate에 맡길 수 있으나,
                    // PC 조작은 즉시 동기화하는 것이 사용자 경험에 더 좋습니다. (기존 로직 유지)
                    updateThumbnail(currentScene);
                    syncStateToFirestore();
                };
            };
        }

        // 좌우 반전 버튼
        const flipButton = element.querySelector('.flip');
        if (flipButton) {
            flipButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleControllerControl(element.id, 'flip'); // ❗️이 함수는 이제 requestPcUpdate를 호출
            });
        }
        
        // 삭제 버튼
        const deleteButton = element.querySelector('.delete');
        if (deleteButton) {
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleControllerControl(element.id, 'delete'); // ❗️이 함수는 즉시 동기화/삭제
            });
        }
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
            renderScene(currentScene); // ❗️ 씬 전환 시 전체 렌더링 (정상)
        });
    });
    
    // --- 11. 타임라인 썸네일 업데이트 ---
    function updateThumbnail(sceneNumber) {
        const sceneEl = document.querySelector(`.scene[data-scene="${sceneNumber}"]`);
        if (sceneEl) {
            sceneEl.innerHTML = ''; 
            
            const sceneData = storyData[sceneNumber];
            sceneEl.style.backgroundImage = 'none';
            
            if(!canvas || canvas.offsetWidth === 0) return;

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
    
    // PC 모드에서 최초 상태 동기화 (세션 ID 생성 후)
    if (!isControllerMode) {
        syncStateToFirestore();
    }
});
