document.addEventListener('DOMContentLoaded', () => {
    // Firebase 전역 객체 'db'는 index.html의 <script> 태그에서 초기화되었습니다.
    if (typeof db === 'undefined') {
        console.error("Firebase Firestore is not initialized. Make sure 'db' is available.");
        alert("Firebase 연결 실패! HTML 파일의 설정값을 확인하세요.");
        return;
    }

    // 1. 모드 판별, 기본 변수 및 세션 설정
    const urlParams = new URLSearchParams(window.location.search);
    
    // ⭐ 수정: mode=controller 확인 로직 제거
    // 이 로직은 이제 controller.html 파일이 담당합니다.
    
    // 세션 ID: PC와 모바일을 연결하는 고유 ID
    let SESSION_ID = urlParams.get('session');
    if (!SESSION_ID) {
        // PC 모드에서만 새로 생성
        SESSION_ID = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        window.history.replaceState({}, document.title, `?session=${SESSION_ID}`);
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

    // =========================================================================
    // ⭐ 🚨통신 핵심 로직: Firebase Firestore를 통한 데이터 송수신🚨 ⭐
    // =========================================================================

    // PC -> 모바일 (상태 동기화)
    async function syncStateToFirestore() {
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
        // Firestore의 특정 문서(세션 ID)를 실시간 감시
        CONTROLLER_REF.onSnapshot((doc) => {
            if (doc.exists && doc.data().command) {
                const command = doc.data().command;
                
                if (command.timestamp && command.timestamp.toMillis() > lastCommandTimestamp) {
                    lastCommandTimestamp = command.timestamp.toMillis();
                    
                    // 명령 처리
                    handleControllerControl(command.id, command.action, command.data);

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
    // ⭐ PC 메인 웹사이트 로직 ⭐
    // =========================================================================
    
    // PC 모드에서는 명령 수신을 위한 리스너를 즉시 시작
    listenForControlCommands(); 
    
    // --- ⭐ 컨트롤러 창 열기 이벤트 리스너 (QR 코드 표시) ⭐ ---
    if (openControllerBtn) {
        openControllerBtn.addEventListener('click', () => {
            if (qrModal) qrModal.style.display = 'flex';
            
            // ⭐⭐⭐ 중요: QR 코드 URL 수정 ⭐⭐⭐
            // 'style3.html' 같은 현재 파일명을 제거하고 기본 경로를 찾습니다.
            const currentPath = window.location.pathname; // 예: /A/B/style3.html
            const basePath = currentPath.substring(0, currentPath.lastIndexOf('/')); // 예: /A/B
            
            // QR코드가 'controller.html'을 가리키도록 URL을 생성합니다.
            // (PC와 모바일 파일이 같은 폴더에 있어야 합니다)
            const controllerUrl = `${window.location.origin}${basePath}/controller.html?session=${SESSION_ID}`;
            // ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐

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

    // --- 3. 컨트롤러 조작 명령 처리 함수 ---
    
    // 깜빡임 없는 'updateItemTransform' 함수
    function updateItemTransform(id) {
        const decoData = storyData[currentScene].decorations.find(d => d.id === id);
        if (!decoData) return;
        
        const element = document.getElementById(id);
        if (!element) return;

        // 위치, 회전, 크기(scaleX)를 한 번에 적용
        element.style.transform = `rotate(${decoData.rotation}deg)`;
        element.style.left = `${decoData.x}px`;
        element.style.top = `${decoData.y}px`;
        element.style.width = `${decoData.width}px`;
        element.style.height = `${decoData.height}px`;

        // 이미지 태그의 scaleX도 업데이트 (좌우반전용)
        const img = element.querySelector('img');
        if (img) {
            img.style.transform = `scaleX(${decoData.scaleX})`;
        }
    }

    // 컨트롤러 명령 처리 함수
    function handleControllerControl(id, action, data) {
        let decoData;
        
        if (action === 'select') {
            selectItem(data.newId);
            return;
        }

        if (id && selectedDecoId !== id) {
             selectItem(id);
        }
        
        if (selectedDecoId === null) return;
        
        decoData = storyData[currentScene].decorations.find(d => d.id === selectedDecoId);
        if (!decoData) return;

        const step = { rotate: 5, scale: 0.02 }; 
        let updated = false;

        if (action === 'nudge') {
            const dx = data.dx || 0;
            const dy = data.dy || 0;
            
            // controller.js에서 보낸 값(dx/5, dy/5)을 그대로 사용
            // 반응 속도를 위해 PC에서는 값을 증폭 (5배)
            decoData.x += dx * 5; 
            decoData.y += dy * 5;
            updated = true;
            
        } else if (action === 'rotate') {
            const direction = data.direction;
            if (direction === 'LEFT') { decoData.rotation -= step.rotate; updated = true; }
            else if (direction === 'RIGHT') { decoData.rotation += step.rotate; updated = true; }
            
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
                
                updated = true;
            }
        } else if (action === 'flip') {
            decoData.scaleX *= -1;
            updated = true;
        } else if (action === 'delete') {
            const index = storyData[currentScene].decorations.findIndex(d => d.id === id);
            if (index > -1) {
                storyData[currentScene].decorations.splice(index, 1);
                const element = document.getElementById(id);
                if (element) element.remove();
                selectItem(null); // 삭제 후 선택 해제 및 동기화
                updateThumbnail(currentScene);
                return; 
            }
        }

        if (updated) {
            // 수정: renderScene() 대신 updateItemTransform() 호출
            updateItemTransform(decoData.id);
        }
    }


    // --- 4. 장식 아이템 추가 이벤트 핸들러 (PC에서만 작동) ---
    document.querySelectorAll('.asset-item[data-type="decoration"]').forEach(item => {
        item.addEventListener('click', () => {
            if (storyData[currentScene].decorations.length >= 3) {
                alert("장식 아이템은 최대 3개까지만 추가할 수 있습니다.");
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
            renderScene(currentScene); // 새 아이템 추가 시에는 렌더링 필요
            selectItem(newDeco.id);
        });
    });


    // --- 5. 씬 렌더링 함수 (씬 변경, 아이템 추가/삭제 시에만 호출) ---
    function renderScene(sceneNumber) {
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
        const item = document.createElement('div');
        item.className = 'decoration-item';
        item.id = decoData.id;

        const img = document.createElement('img');
        img.src = decoData.src;

        const controls = document.createElement('div');
        controls.className = 'controls';
        // 이미지 경로 확인!
        controls.innerHTML = `<button class="flip" title="좌우반전"><img src="img/좌우반전.png" alt="좌우반전"></button>
                              <button class="delete" title="삭제"><img src="img/휴지통.png" alt="삭제"></button>`;
        
        const handles = ['tl', 'tr', 'bl', 'br', 'rotator'].map(type => {
            const handle = document.createElement('div');
            handle.className = `handle ${type}`;
            return handle;
        });

        item.append(img, ...handles, controls);
        canvas.appendChild(item);
        
        // 스타일 즉시 적용
        updateItemTransform(decoData.id);

        makeInteractive(item);
    }

    // --- 7. 인터랙티브 기능 부여 함수 (PC에서의 직접 조작) ---
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
            verticalGuide.style.display = 'none';
            horizontalGuide.style.display = 'none';

            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;

            const snapThreshold = 5; 
            
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
                verticalGuide.style.left = `${canvasCenterX}px`;
                verticalGuide.style.display = 'block';
                snappedX = true;
            }

            // 세로 중앙 스냅
            if (Math.abs(elementCenterY - canvasCenterY) < snapThreshold) {
                newTop = canvasCenterY - elementHeight / 2;
                horizontalGuide.style.top = `${canvasCenterY}px`;
                horizontalGuide.style.display = 'block';
                snappedY = true;
            }

            if (!snappedX) verticalGuide.style.display = 'none';
            if (!snappedY) horizontalGuide.style.display = 'none';
            
            // ⭐ 수정: decoData에 바로 반영
            decoData.x = newLeft;
            decoData.y = newTop;
            updateItemTransform(decoData.id);
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;

            verticalGuide.style.display = 'none';
            horizontalGuide.style.display = 'none';

            // decoData.x = element.offsetLeft;
            // decoData.y = element.offsetTop;
            updateThumbnail(currentScene);
            syncStateToFirestore(); // 드래그 끝날 때만 동기화
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

                const canvasRect = canvas.getBoundingClientRect();
                const finalLeft = newGlobalCenter.x - (newWidth / 2) - canvasRect.left;
                const finalTop = newGlobalCenter.y - (newHeight / 2) - canvasRect.top;

                // ⭐ 수정: decoData에 바로 반영
                decoData.width = newWidth;
                decoData.height = newHeight;
                decoData.x = finalLeft;
                decoData.y = finalTop;
                updateItemTransform(decoData.id);
            };

            document.onmouseup = () => {
                document.onmousemove = null;
                document.onmouseup = null;
                updateThumbnail(currentScene);
                syncStateToFirestore(); // 리사이즈 끝날 때만 동기화
            };
        }

        // 회전 (로테이터 핸들)
        const rotator = element.querySelector('.rotator');
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
                
                // ⭐ 수정: decoData에 바로 반영
                decoData.rotation = newRotation;
                updateItemTransform(decoData.id);
            };
            document.onmouseup = function() {
                document.onmousemove = null; document.onmouseup = null;
                updateThumbnail(currentScene);
                syncStateToFirestore(); // 회전 끝날 때만 동기화
            };
        };

        // 좌우 반전 버튼
        element.querySelector('.flip').addEventListener('click', (e) => {
            e.stopPropagation();
            handleControllerControl(element.id, 'flip');
            updateThumbnail(currentScene); // 썸네일 업데이트
        });
        
        // 삭제 버튼
        element.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            handleControllerControl(element.id, 'delete');
            // 썸네일 업데이트는 handleControllerControl('delete') 내부에서 호출됨
        });
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
            renderScene(currentScene); // 씬 바꿀 때는 렌더링
        });
    });
    
    // --- 11. 타임라인 썸네일 업데이트 ---
    function updateThumbnail(sceneNumber) {
        const sceneEl = document.querySelector(`.scene[data-scene="${sceneNumber}"]`);
        if (sceneEl) {
            sceneEl.innerHTML = ''; 
            
            const sceneData = storyData[sceneNumber];
            sceneEl.style.backgroundImage = 'none';
            
            if(canvas.offsetWidth === 0) return;

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
    syncStateToFirestore();
});

