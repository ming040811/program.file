document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const verticalGuide = document.querySelector('.vertical-guide');
    const horizontalGuide = document.querySelector('.horizontal-guide');

    const storyData = {
        '1': { background: '', decorations: [] }, '2': { background: '', decorations: [] },
        '3': { background: '', decorations: [] }, '4': { background: '', decorations: [] },
        '5': { background: '', decorations: [] }, '6': { background: '', decorations: [] },
    };
    let currentScene = 1;

    document.querySelectorAll('.asset-item[data-type="decoration"]').forEach(item => {
        item.addEventListener('click', () => {
            
            const canvasImageSrc = item.dataset.canvasSrc || item.src;

            let initialWidth = 400; // 기본값
            let initialHeight = 400; // 기본값

            // 가로등1-2 이미지일 경우 비율 조정
            if (canvasImageSrc.includes('가로등1-2.png')) {
                const originalWidth = 340;
                const originalHeight = 1200;
                initialHeight = 400; // 기준 높이
                initialWidth = (originalWidth / originalHeight) * initialHeight;
            } 
            // 쌍가로등1-2 이미지일 경우 비율 조정
            else if (canvasImageSrc.includes('쌍가로등1-2.png')) {
                const originalWidth = 450;
                const originalHeight = 1200;
                initialHeight = 400; // 기준 높이
                initialWidth = (originalWidth / originalHeight) * initialHeight;
            }
            // 다른 이미지들은 400x400으로 유지

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
        });
    });

    document.querySelectorAll('.asset-item[data-type="background"]').forEach(item => {
         item.addEventListener('click', () => {
             storyData[currentScene].background = item.src;
             renderScene(currentScene);
          });
    });

    function renderScene(sceneNumber) {
        const data = storyData[sceneNumber];
        canvas.style.backgroundImage = data.background ? `url(${data.background})` : 'none';
        
        Array.from(canvas.children).forEach(child => {
            if (child.classList.contains('decoration-item')) {
                child.remove();
            }
        });
        data.decorations.forEach(createDecorationElement);
        updateThumbnail(sceneNumber);
    }

    function createDecorationElement(decoData) {
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
        img.style.transform = `scaleX(${decoData.scaleX})`;

        const controls = document.createElement('div');
        controls.className = 'controls';
        controls.innerHTML = `<button class="flip" title="좌우반전"><img src="img/좌우반전.png" alt="좌우반전"></button>
                              <button class="delete" title="삭제"><img src="img/휴지통.png" alt="삭제"></button>`;
        
        const handles = ['tl', 'tr', 'bl', 'br', 'rotator'].map(type => {
            const handle = document.createElement('div');
            handle.className = `handle ${type}`;
            return handle;
        });

        item.append(img, ...handles, controls);
        canvas.appendChild(item);

        makeInteractive(item);
    }

    function makeInteractive(element) {
        const decoData = storyData[currentScene].decorations.find(d => d.id === element.id);

        element.addEventListener('mousedown', (e) => {
            document.querySelectorAll('.decoration-item').forEach(el => el.classList.remove('selected'));
            element.classList.add('selected');
            e.stopPropagation();
        });

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

            if (Math.abs(elementCenterX - canvasCenterX) < snapThreshold) {
                newLeft = canvasCenterX - elementWidth / 2;
                verticalGuide.style.left = `${canvasCenterX}px`;
                verticalGuide.style.display = 'block';
                snappedX = true;
            }

            if (Math.abs(elementCenterY - canvasCenterY) < snapThreshold) {
                newTop = canvasCenterY - elementHeight / 2;
                horizontalGuide.style.top = `${canvasCenterY}px`;
                horizontalGuide.style.display = 'block';
                snappedY = true;
            }

            if (!snappedX) verticalGuide.style.display = 'none';
            if (!snappedY) horizontalGuide.style.display = 'none';
            
            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;

            verticalGuide.style.display = 'none';
            horizontalGuide.style.display = 'none';

            decoData.x = element.offsetLeft;
            decoData.y = element.offsetTop;
            updateThumbnail(currentScene);
        }
        
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
                updateThumbnail(currentScene);
            };
        }

        const rotator = element.querySelector('.rotator');
        rotator.onmousedown = function(e) {
            e.preventDefault(); e.stopPropagation();
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
            const startRotation = decoData.rotation;

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
                updateThumbnail(currentScene);
            };
        };

        element.querySelector('.flip').addEventListener('click', (e) => {
            e.stopPropagation();
            decoData.scaleX *= -1;
            element.querySelector('img').style.transform = `scaleX(${decoData.scaleX})`;
            updateThumbnail(currentScene);
        });
        
        element.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            const index = storyData[currentScene].decorations.findIndex(d => d.id === element.id);
            if (index > -1) {
                storyData[currentScene].decorations.splice(index, 1);
                element.remove();
                updateThumbnail(currentScene);
            }
        });
    }

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

    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.decoration-item')) {
            document.querySelectorAll('.decoration-item').forEach(el => el.classList.remove('selected'));
        }
    });

    const tabs = document.querySelectorAll('.tab-button');
    const assetLists = document.querySelectorAll('.asset-list');
    const scenes = document.querySelectorAll('.scene');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            assetLists.forEach(list => list.style.display = 'none');
            document.getElementById(tab.dataset.tab).style.display = 'grid';
        });
    });

    scenes.forEach(scene => {
        scene.addEventListener('click', () => {
            scenes.forEach(s => s.classList.remove('active'));
            scene.classList.add('active');
            currentScene = scene.dataset.scene;
            renderScene(currentScene);
        });
    });
    
    function updateThumbnail(sceneNumber) {
        const sceneEl = document.querySelector(`.scene[data-scene="${sceneNumber}"]`);
        if (sceneEl) {
            sceneEl.innerHTML = ''; 
            
            const sceneData = storyData[sceneNumber];
            sceneEl.style.backgroundImage = sceneData.background ? `url(${sceneData.background})` : 'none';
            
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

    document.querySelectorAll('.scene').forEach(scene => {
        updateThumbnail(scene.dataset.scene);
    });
});
