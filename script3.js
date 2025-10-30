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

    // 기본 DOM 요소
    const canvas = document.getElementById('canvas');
    const openControllerBtn = document.getElementById('open-controller-btn');
    const verticalGuide = document.querySelector('.vertical-guide');
    const horizontalGuide = document.querySelector('.horizontal-guide');
    const qrModal = document.getElementById('qr-modal');
    const qrcodeDiv = document.getElementById('qrcode-container');

    // 스토리 데이터
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
    
    // ⭐ [수정] 단일 선택 변수를 배열로 변경
    let selectedDecoIds = []; 
    let toastTimer = null;

    // --- 알림창 표시 함수 ---
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

        const canvasWidth = canvas.offsetWidth;
        const canvasHeight = canvas.offsetHeight;

        const decoListForMobile = storyData[currentScene].decorations.map(deco => {
            const decoElement = document.getElementById(deco.id) || {};
            const decoRect = decoElement.getBoundingClientRect ? decoElement.getBoundingClientRect() : { width: deco.width, height: deco.height };

            return {
                id: deco.id,
                // ⭐ [좌표 매핑 수정] PC Y -> 모바일 X (컨트롤러 가로)
                x_mobile: (deco.y + decoRect.height / 2) / canvasHeight, 
                // ⭐ [좌표 매핑 수정] PC X -> 모바일 Y (컨트롤러 세로)
                y_mobile: (deco.x + decoRect.width / 2) / canvasWidth   
            };
        });
        
        const state = {
            scene: currentScene,
            // ⭐ [수정] 선택된 ID 배열(selectedDecoIds)을 그대로 전송
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
    
    // 모바일 -> PC (조작 명령 수신 리스너)
    let lastCommandTimestamp = 0;

    function listenForControlCommands() {
        CONTROLLER_REF.onSnapshot((doc) => {
            if (doc.exists && doc.data().command) {
                const command = doc.data().command;
                
                if (command.timestamp && command.timestamp.toMillis() > lastCommandTimestamp) {
                    lastCommandTimestamp = command.timestamp.toMillis();
                    
                    const action = command.action;
                    const data = command.data || {};

                    if (action === 'select_multi') {
                        // ⭐ [수정] 컨트롤러의 선택 배열(data.ids)을 PC에 그대로 반영
                        selectItems(data.ids || []);

                    } else if (action === 'control_one') {
                        // 개별 아이템 이동 (터치패드 드래그)
                        // ⭐ [좌표 매핑 수정] x_mobile, y_mobile 순서 변경
                        handleItemMove(data.id, data.y_mobile, data.x_mobile); // (id, pcX_logic, pcY_logic)

                    } else if (action === 'control_multi') {
                        // 다중 아이템 조작 (버튼)
                        data.ids.forEach(id => {
                            handleControllerControl(id, data.action, { direction: data.direction });
                        });

                    } else if (action === 'delete_multi') {
                        // 다중 아이템 삭제 (버튼)
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
    
    // --- QR 코드 버튼 이벤트 리스너 ---
    if (openControllerBtn) {
        openControllerBtn.addEventListener('click', () => {
            if (qrModal) qrModal.style.display = 'flex';
            
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const controllerUrl = `${baseUrl}/controller.html?session=${SESSION_ID}`;

            if (qrcodeDiv) qrcodeDiv.innerHTML = '';
            
            if (qrcodeDiv && typeof QRCode !== 'undefined') {
                new QRCode(qrcodeDiv, {
                    text: controllerUrl, 
                    width: 256,
                    height: 256
                });
            }
            syncStateToFirestore(); 
        });
    }

    // --- [수정] 아이템 선택 처리 함수 (복수 선택) ---
    function selectItems(ids = []) {
        // 1. (데이터) 새 ID 목록으로 교체
        selectedDecoIds = ids;

        // 2. (UI) 모든 .decoration-item에서 'selected' 클래스 제거
        document.querySelectorAll('.decoration-item').forEach(el => {
            // 3. (UI) 새 목록에 있는 ID에만 'selected' 클래스 추가
            if (selectedDecoIds.includes(el.id)) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
        
        // 4. 상태 동기화
        syncStateToFirestore(); 
    }

    // --- [수정] 모바일 좌표계로 아이템 이동 처리 ---
    function handleItemMove(id, mobileControllerX, mobileControllerY) {
        if (!canvas || !id) return;
        const decoData = storyData[currentScene].decorations.find(d => d.id === id);
        const element = document.getElementById(id);
        if (!decoData || !element) return;

        const canvasWidth = canvas.offsetWidth;
        const canvasHeight = canvas.offsetHeight;
        const decoRect = element.getBoundingClientRect();

        // ⭐ [핵심] 좌표 90도 회전 적용 (컨트롤러 -> PC)
        // PC X (가로) = 컨트롤러 Y (세로)
        decoData.x = (mobileControllerX * canvasWidth) - (decoRect.width / 2);
        // PC Y (세로) = 컨트롤러 X (가로)
        decoData.y = (mobileControllerY * canvasHeight) - (decoRect.height / 2);

        updateElementStyle(decoData);
        
        syncStateToFirestore();
        updateThumbnail(currentScene);
    }

    // --- [수정] 컨트롤러 버튼 조작 처리 함수 ---
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
            
            const element = document.getElementById(id);
            const decoRect = element ? element.getBoundingClientRect() : { width: decoData.width, height: decoData.height };
            
            if (decoRect.width * factor > 20 && decoRect.height * factor > 20) {
                const deltaWidth = (decoRect.width * factor) - decoRect.width;
                const deltaHeight = (decoRect.height * factor) - decoRect.height;
                
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
                
                // ⭐ [수정] 삭제된 아이템이 선택 목록에 있는지 확인
                if (selectedDecoIds.includes(id)) {
                    // 목록에서 제거하고 갱신
                    selectedDecoIds = selectedDecoIds.filter(i => i !== id);
                    selectItems(selectedDecoIds);
                } else {
                    // 선택 목록에 변경이 없으므로, 그냥 상태 동기화
                    syncStateToFirestore(); 
                }
                updateThumbnail(currentScene); 
                return; 
            }
        }

        // 공통 업데이트
        updateElementStyle(decoData);
        syncStateToFirestore();
        updateThumbnail(currentScene);
    }

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
            renderScene(currentScene); 
            
            // ⭐ [수정] 새 아이템을 유일한 선택 항목으로 지정
            selectItems([newDeco.id]);
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
        
        // ⭐ [수정] 씬 렌더링 시, 현재 씬에 없는 아이템은 선택 목록에서 제거
        const newDecoIds = new Set(data.decorations.map(d => d.id));
        selectedDecoIds = selectedDecoIds.filter(id => newDecoIds.has(id));
        
        // ⭐ [수정] selectItem 대신 selectItems 호출
        selectItems(selectedDecoIds); 
        
        setTimeout(() => updateThumbnail(sceneNumber), 50); 
        // selectItems 함수 내부에서 syncStateToFirestore가 호출되므로 중복 호출 제거
        // syncStateToFirestore(); 
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

    // --- [수정] 인터랙티브 기능 부여 함수 (PC 직접 조작) ---
    function makeInteractive(element) {
        const decoData = storyData[currentScene].decorations.find(d => d.id === element.id);
        if (!decoData) return;

        // ⭐ [수정] 선택 로직 (컨트롤러와 동일한 "최대 2개" 로직)
        element.addEventListener('mousedown', (e) => {
            if (e.target.closest('.handle') || e.target.closest('.controls')) return;
            
            const id = element.id;
            const isSelected = selectedDecoIds.includes(id);

            if (isSelected) {
                // 1. 이미 선택됨 -> 선택 해제
                selectedDecoIds = selectedDecoIds.filter(i => i !== id);
            } else {
                // 2. 선택 안 됨
                if (selectedDecoIds.length < 2) {
                    // 2a. (0 or 1개) -> 선택 추가
                    selectedDecoIds.push(id);
                } else {
                    // 2b. (2개) -> 가장 오래된 것(0번) 제거, 새 것 추가
                    selectedDecoIds.shift();
                    selectedDecoIds.push(id);
                }
            }
            // UI 갱신 및 상태 동기화
            selectItems(selectedDecoIds); 
            e.stopPropagation();
        });

        // 이동 (드래그)
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        element.onmousedown = function(e) {
            if (e.target.closest('.handle') || e.target.closest('.controls')) return;
            
            // ⭐ [추가] 드래그 시작 시점에도 선택 로직이 실행되도록 함
            const id = element.id;
            if (!selectedDecoIds.includes(id)) {
                // 클릭 시점의 선택 로직과 동일하게 처리
                const isSelected = selectedDecoIds.includes(id); // false
                if (selectedDecoIds.length < 2) {
                    selectedDecoIds.push(id);
                } else {
                    selectedDecoIds.shift();
                    selectedDecoIds.push(id);
                }
                selectItems(selectedDecoIds);
            }
            
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
            syncStateToFirestore(); // PC 조작 완료 후 동기화
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
                syncStateToFirestore(); // PC 조작 완료 후 동기화
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
                    syncStateToFirestore(); // PC 조작 완료 후 동기화
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
                syncStateToFirestore();
                updateThumbnail(currentScene);
            });
        }
        const deleteButton = element.querySelector('.delete');
        if (deleteButton) {
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleControllerControl(element.id, 'delete');
            });
        }
    } // --- makeInteractive 끝 ---
    
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

    // --- [수정] 캔버스 외부 클릭 시 선택 해제 ---
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.decoration-item') && !e.target.closest('.asset-item') && !e.target.closest('#qr-modal')) {
            // ⭐ [수정] 빈 배열로 선택 해제
            selectItems([]);
        }
    });

    // --- 10. 씬 전환 ---
    const scenes = document.querySelectorAll('.scene');
    scenes.forEach(scene => {
        scene.addEventListener('click', () => {
            scenes.forEach(s => s.classList.remove('active'));
            scene.classList.add('active');
            currentScene = scene.dataset.scene;
            renderScene(currentScene); 
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
});
