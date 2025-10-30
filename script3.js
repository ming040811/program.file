document.addEventListener('DOMContentLoaded', () => {
    // ❗️ index.html에서 'db' 객체가 초기화되어야 합니다.
    if (typeof db === 'undefined') {
        console.error("Firebase Firestore 'db' is not initialized.");
        return;
    }

    // --- 1. 모드 판별, 기본 변수 및 세션 설정 ---
    let SESSION_ID = new URLSearchParams(window.location.search).get('session');
    if (!SESSION_ID) {
        SESSION_ID = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        window.history.replaceState({}, document.title, `?session=${SESSION_ID}`);
    }
    
    const CONTROLLER_REF = db.collection('controllers').doc(SESSION_ID);

    // ... (DOM 요소 및 storyData 정의는 이전과 동일) ...
    const canvas = document.getElementById('canvas');
    const openControllerBtn = document.getElementById('open-controller-btn');
    const verticalGuide = document.querySelector('.vertical-guide');
    const horizontalGuide = document.querySelector('.horizontal-guide');
    const qrModal = document.getElementById('qr-modal');
    const qrcodeDiv = document.getElementById('qrcode-container');
    const storyData = {
        '1': { background: '', decorations: [] }, '2': { background: '', decorations: [] },
        '3': { background: '', decorations: [] }, '4': { background: '', decorations: [] },
        '5': { background: '', decorations: [] }, '6': { background: '', decorations: [] },
        '7': { background: '', decorations: [] }, '8': { background: '', decorations: [] }
    };
    let currentScene = '1';
    let selectedDecoIds = []; 
    let toastTimer = null;

    // --- (⭐️ NEW ⭐️) 성능 개선을 위한 쓰로틀링 타이머 ---
    let throttleSyncTimer = null;

    // ... (showLimitToast 함수는 이전과 동일) ...
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
    // ⭐ 🚨통신 핵심 로직 (Firebase)🚨 ⭐
    // =========================================================================

    // PC -> 모바일 (상태 동기화)
    async function syncStateToFirestore() {
        if (!canvas || canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;

        // [⭐️ NEW] 쓰로틀 타이머가 예약된 것을 실행했으므로 타이머를 비웁니다.
        if (throttleSyncTimer) {
            clearTimeout(throttleSyncTimer);
            throttleSyncTimer = null;
        }

        const canvasWidth = canvas.offsetWidth;
        const canvasHeight = canvas.offsetHeight;

        const decoListForMobile = storyData[currentScene].decorations.map(deco => {
            const decoWidth = deco.width;
            const decoHeight = deco.height;
            return {
                id: deco.id,
                x_mobile: (deco.y + decoHeight / 2) / canvasHeight, 
                y_mobile: (deco.x + decoWidth / 2) / canvasWidth   
            };
        });
        
        const state = {
            scene: currentScene,
            selectedIds: selectedDecoIds, 
            decoList: decoListForMobile,
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

    // --- (⭐️ NEW ⭐️) 쓰로틀링된 동기화 요청 함수 ---
    function requestSyncThrottled() {
        // 이미 동기화 타이머가 예약되어 있다면, 아무것도 하지 않습니다.
        if (throttleSyncTimer) {
            return;
        }
        // 100ms 뒤에 동기화를 예약합니다.
        // (100ms 이내에 들어오는 모든 요청은 이 타이머 하나로 처리됩니다)
        throttleSyncTimer = setTimeout(() => {
            syncStateToFirestore(); // 100ms 뒤 syncStateToFirestore 실행
            throttleSyncTimer = null; // 타이머 초기화
        }, 100); // 100ms (0.1초) 지연
    }
    
    
    // 모바일 -> PC (조작 명령 수신 리스너)
    let lastCommandTimestamp = 0;
    function listenForControlCommands() {
        // ... (내용 동일) ...
        CONTROLLER_REF.onSnapshot((doc) => {
            if (doc.exists && doc.data().command) {
                const command = doc.data().command;
                
                if (command.timestamp && command.timestamp.toMillis() > lastCommandTimestamp) {
                    lastCommandTimestamp = command.timestamp.toMillis();
                    const action = command.action;
                    const data = command.data || {};

                    if (action === 'item_click') {
                        handleItemClick(data.id); 
                    } else if (action === 'control_one') {
                        handleItemMove(data.id, data.y_mobile, data.x_mobile); 
                    } else if (action === 'control_multi') {
                        data.ids.forEach(id => {
                            handleControllerControl(id, data.action, { direction: data.direction });
                        });
                    } else if (action === 'delete_multi') {
                        data.ids.forEach(id => {
                            handleControllerControl(id, 'delete');
                        });
                    }

                    // 명령 처리 후, Firestore에서 command 필드 삭제
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
    // ⭐ PC 메인 웹사이트 모드 로직 ⭐
    // =========================================================================
    
    listenForControlCommands(); 
    
    if (openControllerBtn) {
        // ... (내용 동일) ...
        openControllerBtn.addEventListener('click', () => {
            if (qrModal) qrModal.style.display = 'flex';
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const controllerUrl = `${baseUrl}/controller.html?session=${SESSION_ID}`;
            if (qrcodeDiv) qrcodeDiv.innerHTML = '';
            if (qrcodeDiv && typeof QRCode !== 'undefined') {
                new QRCode(qrcodeDiv, { text: controllerUrl, width: 256, height: 256 });
            }
            syncStateToFirestore(); // QR 켤 때는 즉시 동기화
        });
    }

    // --- 컨트롤러 클릭 처리 함수 ---
    function handleItemClick(id) {
        // ... (내용 동일) ...
        if (!id) return;
        const isSelected = selectedDecoIds.includes(id);

        if (isSelected) {
            selectedDecoIds = selectedDecoIds.filter(i => i !== id);
        } else {
            if (selectedDecoIds.length < 2) {
                selectedDecoIds.push(id);
            } else {
                selectedDecoIds.shift();
                selectedDecoIds.push(id);
            }
        }
        // [중요] 선택/해제는 즉시 동기화합니다. (쓰로틀링 없음)
        selectItems(selectedDecoIds, 'pc'); 
    }


    // --- 아이템 선택 처리 함수 ---
    function selectItems(ids = [], source = 'pc') {
        selectedDecoIds = ids;

        document.querySelectorAll('.decoration-item').forEach(el => {
            el.classList.toggle('selected', selectedDecoIds.includes(el.id));
        });
        
        // [중요] 선택/해제(selectItems)는 항상 즉시 동기화합니다.
        syncStateToFirestore(); 
    }

    // --- [⭐️⭐️⭐️ 수정됨 ⭐️⭐️⭐️] 모바일 좌표계로 아이템 이동 처리 ---
    function handleItemMove(id, mobileControllerX, mobileControllerY) {
        if (!canvas || !id) return;
        const decoData = storyData[currentScene].decorations.find(d => d.id === id);
        const element = document.getElementById(id);
        if (!decoData || !element) return;

        const canvasWidth = canvas.offsetWidth;
        const canvasHeight = canvas.offsetHeight;
        
        decoData.x = (mobileControllerX * canvasWidth) - (decoData.width / 2);
        decoData.y = (mobileControllerY * canvasHeight) - (decoData.height / 2);

        updateElementStyle(decoData);
        updateThumbnail(currentScene); // 썸네일은 갱신
        
        // ⭐ [수정]
        // 즉시 동기화 대신, 쓰로틀링된 동기화를 '요청'합니다.
        // syncStateToFirestore(); // <-- 이 줄 대신
        requestSyncThrottled(); // <-- 이 함수 사용
    }

    // --- [⭐️⭐️⭐️ 수정됨 ⭐️⭐️⭐️] 컨트롤러 버튼 조작 처리 함수 ---
    function handleControllerControl(id, action, data) {
        let decoData = storyData[currentScene].decorations.find(d => d.id === id);
        if (!decoData) return;

        const step = { rotate: 5, scale: 0.02 }; 
        
        if (action === 'rotate') {
            const direction = data.direction;
            if (direction === 'LEFT') { decoData.rotation -= step.rotate; }
            else if (direction === 'RIGHT') { decoData.rotation += step.rotate; }
            
        } else if (action === 'scale') {
            const direction = data.direction;
            const factor = 1 + (direction === 'UP' ? step.scale : -step.scale);
            const currentWidth = decoData.width;
            const currentHeight = decoData.height;
            if (currentWidth * factor > 20 && currentHeight * factor > 20) {
                const deltaWidth = (currentWidth * factor) - currentWidth;
                const deltaHeight = (currentHeight * factor) - currentHeight;
                decoData.width *= factor;
                decoData.height *= factor;
                decoData.x -= deltaWidth / 2;
                decoData.y -= deltaHeight / 2;
            }
        } else if (action === 'flip') {
            decoData.scaleX *= -1;

        } else if (action === 'delete') {
            const index = storyData[currentScene].decorations.findIndex(d => d.id === id);
            if (index > -1) {
                storyData[currentScene].decorations.splice(index, 1);
                const element = document.getElementById(id);
                if (element) element.remove();
                
                if (selectedDecoIds.includes(id)) {
                    selectedDecoIds = selectedDecoIds.filter(i => i !== id);
                    // [중요] 삭제는 즉시 동기화 (selectItems가 syncStateToFirestore 호출)
                    selectItems(selectedDecoIds, 'pc'); 
                } else {
                    // [중요] 삭제는 즉시 동기화
                    syncStateToFirestore();
                }
                updateThumbnail(currentScene);
                return; // 함수 종료
            }
        }

        // 공통 업데이트 (삭제 제외)
        updateElementStyle(decoData);
        updateThumbnail(currentScene);
        
        // ⭐ [수정]
        // 회전/크기/반전 처리 후, 쓰로틀링된 동기화를 '요청'합니다.
        // syncStateToFirestore(); // <-- 이 줄 대신
        requestSyncThrottled(); // <-- 이 함수 사용
    }

    // --- (이하 나머지 코드는 이전과 동일합니다) ---

    // --- 아이템 스타일만 가볍게 업데이트하는 함수 ---
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

    // --- 장식 아이템 추가 이벤트 핸들러 ---
    document.querySelectorAll('.asset-item[data-type="decoration"]').forEach(item => {
        item.addEventListener('click', () => {
            if (storyData[currentScene].decorations.length >= 3) {
                showLimitToast(); 
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
                id: 'deco-' + Date.now(), src: canvasImageSrc,
                width: initialWidth, height: initialHeight,
                x: (canvas.offsetWidth / 2) - (initialWidth / 2),
                y: (canvas.offsetHeight / 2) - (initialHeight / 2),
                rotation: 0, scaleX: 1,
            };
            storyData[currentScene].decorations.push(newDeco);
            renderScene(currentScene);
            // [중요] 아이템 추가는 즉시 동기화 (selectItems가 호출)
            selectItems([newDeco.id], 'pc'); 
        });
    });

    // --- 씬 렌더링 함수 ---
    function renderScene(sceneNumber) {
        if (!canvas) return;
        const data = storyData[sceneNumber];
        
        Array.from(canvas.children).forEach(child => {
            if (child.classList.contains('decoration-item')) {
                child.remove();
            }
        });
        
        data.decorations.forEach(createDecorationElement);
        
        const newDecoIds = new Set(data.decorations.map(d => d.id));
        selectedDecoIds = selectedDecoIds.filter(id => newDecoIds.has(id));
        
        // [중요] 씬 변경은 즉시 동기화 (selectItems가 호출)
        selectItems(selectedDecoIds, 'pc'); 
        
        setTimeout(() => updateThumbnail(sceneNumber), 50);
    }

    // --- 장식 요소 생성 함수 ---
    function createDecorationElement(decoData) {
         if (!canvas) return;
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
        makeInteractive(item);
    }

    // --- 인터랙티브 기능 부여 함수 (PC 직접 조작) ---
    function makeInteractive(element) {
        const decoData = storyData[currentScene].decorations.find(d => d.id === element.id);
        if (!decoData) return;

        // PC 클릭 시 선택 로직
        element.addEventListener('mousedown', (e) => {
            if (e.target.closest('.handle') || e.target.closest('.controls')) return;
            // [중요] PC 클릭은 즉시 동기화 (handleItemClick -> selectItems 호출)
            handleItemClick(element.id);
            e.stopPropagation();
        });

        // 이동 (드래그)
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        element.onmousedown = function(e) {
            if (e.target.closest('.handle') || e.target.closest('.controls')) return;
            
            if (!selectedDecoIds.includes(element.id)) {
                 handleItemClick(element.id);
            }
            
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };

        function elementDrag(e) {
            // ... (스냅 로직 포함, 내용 동일) ...
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
            if (Math.abs(elementCenterX - canvasCenterX) < snapThreshold) {
                newLeft = canvasCenterX - elementWidth / 2;
                if (verticalGuide) {
                    verticalGuide.style.left = `${canvasCenterX}px`;
                    verticalGuide.style.display = 'block';
                }
                snappedX = true;
            }
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
            
            updateThumbnail(currentScene); 
            // [중요] PC 조작 완료는 즉시 동기화
            syncStateToFirestore(); 
        }
        
        // 크기 조절 (리사이즈)
        element.querySelectorAll('.handle:not(.rotator)').forEach(handle => {
            handle.onmousedown = initResize;
        });
        
        function initResize(e) {
            // ... (리사이즈 로직, 내용 동일) ...
            e.preventDefault(); e.stopPropagation();
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
                const mouseVector = { x: e_move.clientX - pivot.x, y: e_move.clientY - pivot.y };
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
                element.style.width = newWidth + 'px';
                element.style.height = newHeight + 'px';
                element.style.left = finalLeft + 'px';
                element.style.top = finalTop + 'px';
            };
            document.onmouseup = () => {
                document.onmousemove = null; document.onmouseup = null;
                decoData.width = parseFloat(element.style.width);
                decoData.height = parseFloat(element.style.height);
                decoData.x = element.offsetLeft;
                decoData.y = element.offsetTop;
                updateThumbnail(currentScene); 
                // [중요] PC 조작 완료는 즉시 동기화
                syncStateToFirestore(); 
            };
        }
        
        // 회전 (로테이터 핸들)
        const rotator = element.querySelector('.rotator');
        if (rotator) {
            rotator.onmousedown = function(e) {
                // ... (회전 로직, 내용 동일) ...
                e.preventDefault(); e.stopPropagation();
                const rect = element.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
                let startRotation = decoData.rotation;
                document.onmousemove = function(e_move) {
                    const currentAngle = Math.atan2(e_move.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
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
                    // [중요] PC 조작 완료는 즉시 동기화
                    syncStateToFirestore(); 
                };
            };
        }

        // 컨트롤 버튼 (반전, 삭제)
        const flipButton = element.querySelector('.flip');
        if (flipButton) {
            flipButton.addEventListener('click', (e) => {
                e.stopPropagation();
                decoData.scaleX *= -1;
                updateElementStyle(decoData);
                // [중요] PC 조작은 즉시 동기화
                syncStateToFirestore();
                updateThumbnail(currentScene);
            });
        }
        const deleteButton = element.querySelector('.delete');
        if (deleteButton) {
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                // [중요] PC 조작은 즉시 동기화 (handleControllerControl -> delete가 호출)
                handleControllerControl(element.id, 'delete');
            });
        }
    } // --- makeInteractive 끝 ---
    
    // --- 8. 헬퍼 함수 (회전된 좌표 계산) ---
    function getRotatedCorners(rect, angle) {
        // ... (내용 동일) ...
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
        // ... (내용 동일) ...
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const newX = center.x + dx * Math.cos(angle) - dy * Math.sin(angle);
        const newY = center.y + dx * Math.sin(angle) + dy * Math.cos(angle);
        return { x: newX, y: newY };
    }

    // --- 캔버스 외부 클릭 시 선택 해제 ---
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.decoration-item') && !e.target.closest('.asset-item') && !e.target.closest('#qr-modal')) {
            // [중요] 즉시 동기화 (selectItems가 호출)
            selectItems([], 'pc');
        }
    });

    // --- 10. 씬 전환 ---
    const scenes = document.querySelectorAll('.scene');
    scenes.forEach(scene => {
        scene.addEventListener('click', () => {
            scenes.forEach(s => s.classList.remove('active'));
            scene.classList.add('active');
            currentScene = scene.dataset.scene;
            // [중요] 즉시 동기화 (renderScene -> selectItems가 호출)
            renderScene(currentScene); 
        });
    });
    
    // --- 11. 타임라인 썸네일 업데이트 ---
    function updateThumbnail(sceneNumber) {
        // ... (내용 동일) ...
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
});
