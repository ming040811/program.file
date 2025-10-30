document.addEventListener('DOMContentLoaded', () => {
    // 0. DOM 요소 및 기본 변수
    const canvas = document.getElementById('canvas');
    const openControllerBtn = document.getElementById('open-controller-btn');
    const verticalGuide = document.querySelector('.vertical-guide');
    const horizontalGuide = document.querySelector('.horizontal-guide');
    const qrModal = document.getElementById('qr-modal');
    const qrcodeDiv = document.getElementById('qrcode-container');

    // 1. Firebase 연동 변수
    // 'db' 객체는 index.html의 <script> 태그에서 전역으로 생성되었습니다.
    if (typeof db === 'undefined') {
        console.error("Firebase Firestore 'db' 객체를 찾을 수 없습니다.");
        return;
    }
    const SESSION_ID = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const CONTROLLER_REF = db.collection('controllers').doc(SESSION_ID);
    console.log("세션 ID:", SESSION_ID);

    // 2. 스토리 데이터
    const storyData = {
        '1': { background: '', decorations: [] }, 
        '2': { background: '', decorations: [] },
        '3': { background: '', decorations: [] }, 
        '4': { background: '', decorations: [] },
        '5': { background: '', decorations: [] }, 
        '6': { background: '', decorations: [] },
        '7': { background: '', decorations: [] }, 
        '8': { background: '', decorations: [] }
    };
    let currentScene = '1';
    let selectedDecoId = null; // 메인 사이트는 단일 선택만 지원
    let toastTimer = null; 

    // 3. 알림창 표시 함수
    function showLimitToast() {
        const toast = document.getElementById('limit-toast-notification');
        if (!toast) return;
        if (toastTimer) clearTimeout(toastTimer);
        toast.style.display = 'flex'; 
        toastTimer = setTimeout(() => {
            toast.style.display = 'none';
            toastTimer = null;
        }, 3000);
    }

    // =========================================================================
    // ⭐ 4. Firebase 통신 (PC <-> 모바일)
    // =========================================================================

    // PC -> 모바일 (상태 동기화)
    async function syncStateToFirestore() {
        if (!canvas) return;
        const frameWidth = canvas.offsetWidth;
        const frameHeight = canvas.offsetHeight;
        if (frameWidth === 0 || frameHeight === 0) return; // 캔버스 크기 0이면 중단

        // 컨트롤러가 사용할 0.0 ~ 1.0 정규화된 좌표로 변환
        const normalizedDecoList = storyData[currentScene].decorations.map(deco => ({
            id: deco.id,
            x: deco.x / frameWidth,  // 픽셀 -> 정규화
            y: deco.y / frameHeight, // 픽셀 -> 정규화
        }));

        // 컨트롤러는 다중 선택을 지원하므로 배열로 전송
        const selectedIds = selectedDecoId ? [selectedDecoId] : [];

        const state = {
            scene: currentScene,
            decoList: normalizedDecoList, // 정규화된 좌표 리스트
            selectedIds: selectedIds,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            // 'pcState' 필드에 상태 객체를 저장
            await CONTROLLER_REF.set({ pcState: state }, { merge: true });
        } catch (error) {
            console.error("Error syncing state to Firestore:", error);
        }
    }
    
    // 모바일 -> PC (조작 명령 수신 리스너)
    let lastCommandTimestamp = 0; 

    function listenForControlCommands() {
        CONTROLLER_REF.onSnapshot((doc) => {
            if (doc.exists && doc.data().command) {
                const command = doc.data().command;
                
                if (command.timestamp && command.timestamp.toMillis() > lastCommandTimestamp) {
                    lastCommandTimestamp = command.timestamp.toMillis();
                    
                    // ⭐ [수정됨] 새 컨트롤러의 명령어(type)에 맞게 처리
                    handleControllerCommand(command);

                    // 명령 처리 후, Firestore에서 command 필드를 삭제
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

    // ⭐ [수정됨] 컨트롤러 명령 처리 함수
    function handleControllerCommand(command) {
        const { type, ...data } = command;
        let needsSync = true;
        let needsThumbnailUpdate = true;
        
        // console.log("명령 수신:", type, data);

        switch (type) {
            case 'DECO_SELECT_MULTI':
                // 메인 사이트는 단일 선택만 하므로, 목록의 첫 번째 아이템을 선택
                selectItem(data.ids[0] || null);
                needsSync = false; // selectItem이 이미 syncStateToFirestore를 호출함
                needsThumbnailUpdate = false;
                break;

            case 'DECO_DELETE_MULTI':
                data.ids.forEach(id => {
                    const index = storyData[currentScene].decorations.findIndex(d => d.id === id);
                    if (index > -1) {
                        storyData[currentScene].decorations.splice(index, 1);
                        const element = document.getElementById(id);
                        if (element) element.remove();
                    }
                });
                selectItem(null); // 선택 해제 (내부에서 sync 호출)
                needsSync = false;
                break;

            case 'DECO_CONTROL': // 이동
                const decoDataMove = storyData[currentScene].decorations.find(d => d.id === data.id);
                if (decoDataMove && data.action === 'move') {
                    // 정규화된 좌표 -> 픽셀로 변환
                    decoDataMove.x = data.x * canvas.offsetWidth;
                    decoDataMove.y = data.y * canvas.offsetHeight;
                    updateElementStyle(decoDataMove); // DOM 경량 업데이트
                }
                break;

            case 'DECO_CONTROL_MULTI': // 회전, 크기, 정렬(좌우반전)
                data.ids.forEach(id => {
                    const decoData = storyData[currentScene].decorations.find(d => d.id === id);
                    if (!decoData) return;

                    if (data.action === 'align') { // 좌우반전으로 해석 (align UP/DOWN은 무시)
                         handleItemControl(decoData, 'flip');
                    } else {
                         handleItemControl(decoData, data.action, data.direction);
                    }
                });
                break;
        }

        if (needsThumbnailUpdate) updateThumbnail(currentScene);
        if (needsSync) syncStateToFirestore();
    }
    
    // ⭐ [신규] 아이템 개별 조작 함수 (기존 로직 재활용)
    function handleItemControl(decoData, action, direction) {
        if (!decoData) return;
        const step = { rotate: 5, scale: 0.05 }; // 크기 조절폭 약간 증가

        switch (action) {
            case 'rotate':
                if (direction === 'LEFT') { decoData.rotation -= step.rotate; }
                else if (direction === 'RIGHT') { decoData.rotation += step.rotate; }
                break;
            
            case 'scale':
                const factor = 1 + (direction === 'UP' ? step.scale : -step.scale);
                if (decoData.width * factor > 20 && decoData.height * factor > 20) {
                    const deltaWidth = (decoData.width * factor) - decoData.width;
                    const deltaHeight = (decoData.height * factor) - decoData.height;
                    decoData.width *= factor;
                    decoData.height *= factor;
                    decoData.x -= deltaWidth / 2;
                    decoData.y -= deltaHeight / 2;
                }
                break;
            
            case 'flip': // PC의 좌우반전
                decoData.scaleX *= -1;
                break;
        }
        
        updateElementStyle(decoData);
    }

    // =========================================================================
    // ⭐ 5. PC UI 이벤트 핸들러
    // =========================================================================
    
    // 컨트롤러 QR 코드 열기
    if (openControllerBtn) {
        openControllerBtn.addEventListener('click', () => {
            if (qrModal) qrModal.style.display = 'flex';
            
            // ⭐ [수정됨] controller.html?session=ID 로 QR 생성
            const currentUrl = window.location.href.split('?')[0].replace('index.html', '');
            const controllerUrl = `${currentUrl}controller.html?session=${SESSION_ID}`;
            
            console.log("컨트롤러 URL:", controllerUrl);

            if (qrcodeDiv) qrcodeDiv.innerHTML = '';
            
            if (qrcodeDiv && typeof QRCode !== 'undefined') {
                new QRCode(qrcodeDiv, {
                    text: controllerUrl, 
                    width: 256, height: 256,
                    colorDark : "#000000", colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            }
            // PC 상태를 Firestore에 최초 동기화 (모바일이 연결을 기다리게 함)
            syncStateToFirestore(); 
        });
    }

    // 아이템 선택 처리
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

    // 아이템 스타일만 가볍게 업데이트 (깜빡임 방지)
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

    // 장식 아이템 추가 (PC에서)
    document.querySelectorAll('.asset-item[data-type="decoration"]').forEach(item => {
        item.addEventListener('click', () => {
            if (storyData[currentScene].decorations.length >= 3) {
                showLimitToast(); 
                return;
            }

            const canvasImageSrc = item.dataset.canvasSrc || item.src; 
            let initialWidth = 200, initialHeight = 200;
            if (canvasImageSrc.includes('나비.png')) { 
                initialWidth = 150; initialHeight = 150; 
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
            renderScene(currentScene); // 아이템 추가 시에는 전체 렌더링
            selectItem(newDeco.id); // 추가 후 선택 및 동기화
        });
    });


    // 씬 렌더링 (씬 전환 / 아이템 추가/삭제 시)
    function renderScene(sceneNumber) {
        if (!canvas) return;
        const data = storyData[sceneNumber];
        
        // 기존 아이템 제거
        Array.from(canvas.children).forEach(child => {
            if (child.classList.contains('decoration-item')) child.remove();
        });
        
        data.decorations.forEach(createDecorationElement);
        selectItem(selectedDecoId); // 씬 전환 시 선택 유지 시도
        
        setTimeout(() => updateThumbnail(sceneNumber), 50); 
        syncStateToFirestore(); // 렌더링 후 상태 동기화
    }

    // 장식 요소 생성
    function createDecorationElement(decoData) {
        if (!canvas) return; 
        const item = document.createElement('div');
        item.className = 'decoration-item';
        item.id = decoData.id;
        
        // 스타일 적용 (경량 업데이트 함수 재활용)
        updateElementStyle(decoData); 

        const img = document.createElement('img');
        img.src = decoData.src;
        img.onerror = function() { 
            img.src = `https://placehold.co/${Math.round(decoData.width)}x${Math.round(decoData.height)}/eee/ccc?text=이미지+로드+실패`;
        };
        img.style.transform = `scaleX(${decoData.scaleX})`;

        const controls = document.createElement('div');
        controls.className = 'controls';
        controls.innerHTML = `<button class="flip" title="좌우반전"><img src="img/좌우반전.png" alt="좌우반전" onerror="this.parentNode.innerHTML='반전'"></button>
                                <button class="delete" title="삭제"><img src="img/휴지통.png" alt="삭제" onerror="this.parentNode.innerHTML='삭제'"></button>`;
        
        const handles = ['tl', 'tr', 'bl', 'br', 'rotator'].map(type => {
            const handle = document.createElement('div');
            handle.className = `handle ${type}`;
            return handle;
        });

        item.append(img, ...handles, controls);
        canvas.appendChild(item);

        makeInteractive(item); // PC 조작 이벤트 바인딩
    }

    // PC용 인터랙티브 기능 부여 (드래그, 리사이즈, 회전 등)
    function makeInteractive(element) {
        const decoData = storyData[currentScene].decorations.find(d => d.id === element.id);
        if (!decoData) return;

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

            // ... (스냅 로직 ... - 기존과 동일)
            const snapThreshold = 5; 
            if (!canvas) return;
            const canvasWidth = canvas.offsetWidth, canvasHeight = canvas.offsetHeight;
            const elementWidth = element.offsetWidth, elementHeight = element.offsetHeight;
            const canvasCenterX = canvasWidth / 2, canvasCenterY = canvasHeight / 2;
            const elementCenterX = newLeft + elementWidth / 2, elementCenterY = newTop + elementHeight / 2;
            let snappedX = false, snappedY = false;
            if (Math.abs(elementCenterX - canvasCenterX) < snapThreshold) {
                newLeft = canvasCenterX - elementWidth / 2;
                if (verticalGuide) { verticalGuide.style.left = `${canvasCenterX}px`; verticalGuide.style.display = 'block'; }
                snappedX = true;
            }
            if (Math.abs(elementCenterY - canvasCenterY) < snapThreshold) {
                newTop = canvasCenterY - elementHeight / 2;
                if (horizontalGuide) { horizontalGuide.style.top = `${canvasCenterY}px`; horizontalGuide.style.display = 'block'; }
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

            decoData.x = element.offsetLeft; // 픽셀값 저장
            decoData.y = element.offsetTop; // 픽셀값 저장
            updateThumbnail(currentScene); 
            syncStateToFirestore(); // 드래그 종료 시 동기화
        }
        
        // 크기 조절 (리사이즈)
        element.querySelectorAll('.handle:not(.rotator)').forEach(handle => {
            handle.onmousedown = initResize;
        });
        
        function initResize(e) {
            e.preventDefault(); e.stopPropagation();
            const handleType = e.target.classList[1];
            const rect = element.getBoundingClientRect();
            const angleRad = decoData.rotation * (Math.PI / 180);
            const aspectRatio = decoData.width / decoData.height; 
            const corners = getRotatedCorners(rect, angleRad);
            const oppositeCornerMap = { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl' };
            const pivot = corners[oppositeCornerMap[handleType]]; 
            const isLeft = handleType.includes('l'), isTop = handleType.includes('t');

            document.onmousemove = (e_move) => {
                const mouseVector = { x: e_move.clientX - pivot.x, y: e_move.clientY - pivot.y };
                const rotatedMouseVector = {
                    x: mouseVector.x * Math.cos(-angleRad) - mouseVector.y * Math.sin(-angleRad),
                    y: mouseVector.x * Math.sin(-angleRad) + mouseVector.y * Math.cos(-angleRad)
                };
                let newWidth, newHeight;
                if (Math.abs(rotatedMouseVector.x) / aspectRatio > Math.abs(rotatedMouseVector.y)) {
                    newWidth = Math.abs(rotatedMouseVector.x); newHeight = newWidth / aspectRatio;
                } else {
                    newHeight = Math.abs(rotatedMouseVector.y); newWidth = newHeight * aspectRatio;
                }
                if (newWidth < 20) return; 
                const signX = isLeft ? -1 : 1, signY = isTop ? -1 : 1;
                const localCenter = { x: (signX * newWidth) / 2, y: (signY * newHeight) / 2 };
                const rotatedCenterVector = {
                    x: localCenter.x * Math.cos(angleRad) - localCenter.y * Math.sin(angleRad),
                    y: localCenter.x * Math.sin(angleRad) + localCenter.y * Math.cos(angleRad)
                };
                const newGlobalCenter = { x: pivot.x + rotatedCenterVector.x, y: pivot.y + rotatedCenterVector.y };
                if (!canvas) return;
                const canvasRect = canvas.getBoundingClientRect();
                const finalLeft = newGlobalCenter.x - (newWidth / 2) - canvasRect.left;
                const finalTop = newGlobalCenter.y - (newHeight / 2) - canvasRect.top;
                element.style.width = newWidth + 'px'; element.style.height = newHeight + 'px';
                element.style.left = finalLeft + 'px'; element.style.top = finalTop + 'px';
            };
            document.onmouseup = () => {
                document.onmousemove = null; document.onmouseup = null;
                decoData.width = parseFloat(element.style.width);
                decoData.height = parseFloat(element.style.height);
                decoData.x = element.offsetLeft;
                decoData.y = element.offsetTop;
                updateThumbnail(currentScene); 
                syncStateToFirestore(); // 리사이즈 종료 시 동기화
            };
        }

        // 회전 (로테이터 핸들)
        const rotator = element.querySelector('.rotator');
        if (rotator) {
            rotator.onmousedown = function(e) {
                e.preventDefault(); e.stopPropagation();
                const rect = element.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
                const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
                let startRotation = decoData.rotation;
                document.onmousemove = function(e_move) {
                    const currentAngle = Math.atan2(e_move.clientY - centerY, e_clientX - centerX) * (180 / Math.PI);
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
                    syncStateToFirestore(); // 회전 종료 시 동기화
                };
            };
        }

        // 컨트롤 박스 버튼 (좌우반전, 삭제)
        const flipButton = element.querySelector('.flip');
        if (flipButton) {
            flipButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleItemControl(decoData, 'flip');
                updateThumbnail(currentScene); syncStateToFirestore();
            });
        }
        const deleteButton = element.querySelector('.delete');
        if (deleteButton) {
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                // ⭐ 컨트롤러의 삭제 로직(DECO_DELETE_MULTI)과 동일하게 처리
                const index = storyData[currentScene].decorations.findIndex(d => d.id === element.id);
                if (index > -1) {
                    storyData[currentScene].decorations.splice(index, 1);
                    element.remove();
                }
                selectItem(null); // 삭제 후 선택 해제 및 동기화
                updateThumbnail(currentScene);
            });
        }
    }

    // 헬퍼 함수 (회전된 좌표 계산)
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
        const dx = point.x - center.x; const dy = point.y - center.y;
        const newX = center.x + dx * Math.cos(angle) - dy * Math.sin(angle);
        const newY = center.y + dx * Math.sin(angle) + dy * Math.cos(angle);
        return { x: newX, y: newY };
    }

    // 캔버스 외부 클릭 시 선택 해제
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.decoration-item') && !e.target.closest('.asset-item') && !e.target.closest('#qr-modal')) {
            selectItem(null);
        }
    });

    // 씬 전환
    const scenes = document.querySelectorAll('.scene');
    scenes.forEach(scene => {
        scene.addEventListener('click', () => {
            scenes.forEach(s => s.classList.remove('active'));
            scene.classList.add('active');
            currentScene = scene.dataset.scene;
            selectedDecoId = null; // 씬 전환 시 선택 해제 (정책에 따라 변경 가능)
            renderScene(currentScene); // 씬 전환 시 전체 렌더링
        });
    });
    
    // 타임라인 썸네일 업데이트
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
                // 픽셀 -> 썸네일 픽셀로 변환
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

    // =========================================================================
    // ⭐ 6. 초기 실행
    // =========================================================================
    
    // PC 모드에서 명령 수신 시작
    listenForControlCommands();
    // 초기 렌더링
    renderScene(currentScene);
    // 최초 상태 동기화
    syncStateToFirestore();
});
