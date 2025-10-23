document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('touch-canvas');
    const statusText = document.getElementById('controller-status');
    const controlPanel = document.querySelector('.control-panel');

    let currentDecoList = []; // PC로부터 받은 아이템 목록
    let selectedDecoId = null;
    let dotPositions = {}; // 모바일에서 버튼 위치 기억 (id: {x, y})

    // 속도 제어(Throttling)를 위한 변수
    let lastNudgeTime = 0;
    const NUDGE_INTERVAL = 20; // 20ms (초당 50번)

    // --- 1. 메인 창으로 메시지 전송 ---
    function sendMessage(type, data = {}) {
        if (window.opener) {
            window.opener.postMessage({ type, ...data }, '*');
        } else {
            console.warn('Opener (메인 창)를 찾을 수 없습니다.');
        }
    }

    // --- 2. 동적 버튼(.deco-dot) 렌더링 ---
    function renderDecoDots() {
        if (!canvas) return;
        
        // 기존 버튼 모두 삭제
        canvas.innerHTML = ''; 

        // PC에서 받은 아이템 목록을 기반으로 버튼 다시 생성
        currentDecoList.forEach((deco) => {
            const dot = document.createElement('div');
            dot.className = 'deco-dot';
            dot.dataset.id = deco.id;

            // 저장된 위치가 있으면 사용, 없으면 중앙에 배치
            const pos = dotPositions[deco.id] || { 
                x: canvas.offsetWidth / 2, 
                y: canvas.offsetHeight / 2 
            };
            
            dot.style.left = `${pos.x}px`;
            dot.style.top = `${pos.y}px`;

            // 선택된 아이템이면 .selected 클래스 추가
            if (deco.id === selectedDecoId) {
                dot.classList.add('selected');
            }

            // 이벤트 리스너 추가
            dot.addEventListener('click', () => selectDot(deco.id));
            dot.addEventListener('mousedown', initDrag);
            dot.addEventListener('touchstart', initDrag, { passive: true });

            canvas.appendChild(dot);
        });

        // 아이템이 선택되었는지 여부에 따라 컨트롤 버튼 활성화/비활성화
        const isSelected = selectedDecoId !== null;
        document.querySelectorAll('.control-panel .control-btn').forEach(btn => {
            btn.disabled = !isSelected;
        });
    }

    // --- 3. 아이템 선택 함수 ---
    function selectDot(decoId) {
        if (selectedDecoId === decoId) return; // 이미 선택됨
        
        selectedDecoId = decoId;
        sendMessage('DECO_SELECT', { id: selectedDecoId });
        renderDecoDots(); // 선택 상태를 반영하여 다시 그리기
    }

    // --- 4. 버튼 드래그(이동) 로직 ---
    function initDrag(e) {
        const targetDot = e.currentTarget;
        const decoId = targetDot.dataset.id;

        // 1. 클릭 시 우선 선택
        if (!targetDot.classList.contains('selected')) {
            selectDot(decoId);
        }

        e.preventDefault();

        const isTouch = e.type.startsWith('touch');
        let lastX = isTouch ? e.touches[0].clientX : e.clientX;
        let lastY = isTouch ? e.touches[0].clientY : e.clientY;

        // 캔버스 경계 계산
        const canvasRect = canvas.getBoundingClientRect();

        function drag(e_move) {
            // ⭐ 속도 최적화: 20ms 이내의 이벤트는 무시
            const now = Date.now();
            if (now - lastNudgeTime < NUDGE_INTERVAL) {
                return;
            }
            lastNudgeTime = now;

            const currentX = isTouch ? e_move.touches[0].clientX : e_move.clientX;
            const currentY = isTouch ? e_move.touches[0].clientY : e_move.clientY;
            
            const dx = currentX - lastX; // 마우스/터치 이동 거리 (X)
            const dy = currentY - lastY; // 마우스/터치 이동 거리 (Y)

            // 1. 버튼 DOM 위치 업데이트
            let newLeft = targetDot.offsetLeft + dx;
            let newTop = targetDot.offsetTop + dy;

            // 2. 캔버스 경계 안에서만 움직이도록 제한
            newLeft = Math.max(0, Math.min(newLeft, canvasRect.width - targetDot.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, canvasRect.height - targetDot.offsetHeight));

            targetDot.style.left = `${newLeft}px`;
            targetDot.style.top = `${newTop}px`;

            // 3. 모바일 컨트롤러 내 위치 저장
            dotPositions[decoId] = { x: newLeft, y: newTop };
            
            // 4. 메인 창으로 'nudge' (이동) 요청 전송
            // dx, dy를 보내서 PC가 실제 아이템을 움직이게 함
            // (PC에서는 dx/dy 값을 적절히 스케일링해야 할 수 있음)
            sendMessage('DECO_CONTROL', { 
                id: selectedDecoId, 
                action: 'nudge',
                dx: dx / 5, // 값을 줄여서 PC에서 더 미세하게 움직이도록 함
                dy: dy / 5
            });
            
            lastX = currentX;
            lastY = currentY;
        }

        function stopDrag() {
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchmove', drag);
            document.removeEventListener('touchend', stopDrag);
        }

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', stopDrag);
    }
    
    // --- 5. 오른쪽 컨트롤 패널 버튼 이벤트 ---
    controlPanel.addEventListener('click', (e) => {
        const button = e.target.closest('.control-btn');
        if (!button || button.disabled) return;

        const action = button.dataset.action;
        const direction = button.dataset.direction; // 회전/크기 조절용

        if (action === 'flip') {
            // 좌우반전은 방향이 따로 없으므로 action만 전송
             sendMessage('DECO_CONTROL', { 
                id: selectedDecoId, 
                action: 'flip'
            });
        } else if (action === 'delete') {
             sendMessage('DECO_CONTROL', { 
                id: selectedDecoId, 
                action: 'delete'
            });
        } else {
            // 회전, 크기 조절
             sendMessage('DECO_CONTROL', { 
                id: selectedDecoId, 
                action: action, 
                direction: direction 
            });
        }
    });

    // --- 6. 메인 창으로부터 메시지 수신 ---
    window.addEventListener('message', (event) => {
        // (보안을 위해 event.origin을 확인하는 것이 좋지만, 일단 로직만 구현)
        if (!event.data) return;

        const type = event.data.type;
        
        if (type === 'DECO_LIST_UPDATE') {
            // PC에서 아이템 목록이 업데이트됨 (추가/삭제)
            currentDecoList = event.data.data;
            selectedDecoId = event.data.selectedId;

            // 삭제된 아이템의 위치 정보도 동기화
            const newPositions = {};
            currentDecoList.forEach(deco => {
                if (dotPositions[deco.id]) {
                    newPositions[deco.id] = dotPositions[deco.id];
                }
            });
            dotPositions = newPositions;

            renderDecoDots(); // 캔버스에 버튼 다시 그리기

        } else if (type === 'STATUS_UPDATE') {
            // PC에서 씬(Scene) 정보가 바뀜
            if (statusText) {
                statusText.textContent = event.data.message || '연결됨';
            }
        }
    });

    // --- 7. 초기화 ---
    window.onload = () => {
        // 메인 창(Opener)에게 현재 아이템 목록과 상태를 요청
        sendMessage('REQUEST_DECO_LIST');
        
        // 렌더링이 끝난 후 캔버스 크기에 맞춰 버튼을 다시 그림
        // (초기 로드 시 캔버스 크기 계산 오차 방지)
        setTimeout(renderDecoDots, 100); 
    };

    // 창 크기가 변경될 때 버튼을 다시 그려서 비율 유지
    window.addEventListener('resize', renderDecoDots);
});
