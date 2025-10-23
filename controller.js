document.addEventListener('DOMContentLoaded', () => {
    // 캔버스 미리보기 관련 요소 제거됨
    const controlPanel = document.querySelector('.control-panel');
    const touchPads = document.querySelectorAll('.touch-pad');

    let currentDecoList = []; // ID와 Index 정보 (최대 3개)
    let selectedDecoId = null;

    // --- 1. 메인 창으로 메시지 전송 함수 ---
    function sendMessage(type, data = {}) {
        if (window.opener) {
            window.opener.postMessage({ type, ...data }, '*');
        }
    }

    // --- 2. 터치패드 동적 제어 및 선택 상태 업데이트 ---
    function updateTouchPads() {
        touchPads.forEach(pad => {
            pad.classList.remove('active', 'selected');
        });

        currentDecoList.forEach((deco, index) => {
            const padIndex = index + 1;
            const pad = document.getElementById(`touch-pad-${padIndex}`);
            if (pad) {
                pad.classList.add('active'); 
                
                if (deco.id === selectedDecoId) {
                    pad.classList.add('selected');
                }
            }
        });
        
        // 아이템이 선택되어 있을 때만 조작 버튼 활성화
        const isSelected = selectedDecoId !== null;
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.disabled = !isSelected;
        });
        controlPanel.style.opacity = isSelected ? 1 : 0.4;
    }

    // --- 3. 터치패드 클릭 (아이템 선택) 및 드래그 (이동) 이벤트 리스너 ---
    touchPads.forEach(pad => {
        // 아이템 선택 (클릭/터치)
        pad.addEventListener('click', (e) => {
            if (!pad.classList.contains('active')) return;
            
            const index = parseInt(pad.dataset.index);
            const deco = currentDecoList.find((_, i) => i + 1 === index);

            if (deco && selectedDecoId !== deco.id) {
                selectedDecoId = deco.id;
                sendMessage('DECO_SELECT', { id: selectedDecoId });
                updateTouchPads();
            }
        });
        
        // ⭐ 터치패드 드래그(이동) 이벤트 ⭐
        pad.addEventListener('mousedown', initDrag);
        pad.addEventListener('touchstart', initDrag, { passive: true });
    });
    
    // --- 4. 터치패드 이동 (드래그) 구현 (핵심 로직 변경) ---
    function initDrag(e) {
        const targetPad = e.currentTarget;
        
        // 1. 활성화 및 선택 상태 확인
        if (!targetPad.classList.contains('active')) return;
        if (!targetPad.classList.contains('selected')) {
            targetPad.click(); // 선택 후 드래그 가능하도록 선택 처리
            return; 
        }

        e.preventDefault();
        
        const isTouch = e.type.startsWith('touch');
        
        let lastX = isTouch ? e.touches[0].clientX : e.clientX;
        let lastY = isTouch ? e.touches[0].clientY : e.clientY;
        
        const style = window.getComputedStyle(targetPad);
        // 패드의 현재 offset을 계산 (초기 left/top 값)
        let padOffsetX = parseFloat(style.getPropertyValue('left'));
        let padOffsetY = parseFloat(style.getPropertyValue('top'));

        function drag(e_move) {
            const currentX = isTouch ? e_move.touches[0].clientX : e_move.clientX;
            const currentY = isTouch ? e_move.touches[0].clientY : e_move.clientY;
            
            const dx = currentX - lastX; // 마우스/터치 이동 거리 (X)
            const dy = currentY - lastY; // 마우스/터치 이동 거리 (Y)
            
            // 1. 터치패드 자체 위치 업데이트
            padOffsetX += dx;
            padOffsetY += dy;
            
            targetPad.style.left = padOffsetX + 'px';
            targetPad.style.top = padOffsetY + 'px';
            
            // 2. 메인 창으로 아이템 이동 요청 전송
            // (dx, dy 만큼 아이템을 픽셀 단위로 이동하도록 메인 창에 요청)
            sendMessage('DECO_CONTROL', { 
                id: selectedDecoId, 
                action: 'nudge', // 새로운 액션 타입 (이동 거리를 직접 전달)
                dx: dx,
                dy: dy
            });
            
            lastX = currentX;
            lastY = currentY;
        }

        function stopDrag() {
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchmove', drag);
            document.removeEventListener('touchend', stopDrag);
            
            // 드래그가 끝난 후, 버튼을 원래의 CSS 위치로 리셋 (필요하다면)
            // 현재는 버튼이 마지막 드래그 위치에 머무르도록 유지합니다.
        }

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', stopDrag);
    }
    
    // --- 5. 회전/크기 조절 버튼 이벤트 리스너 (이전과 동일) ---
    document.querySelectorAll('.control-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!selectedDecoId) return; 

            const action = btn.dataset.action;
            const direction = btn.dataset.direction;
            
            // 메인 창으로 조작 명령 전송
            sendMessage('DECO_CONTROL', { id: selectedDecoId, action: action, direction: direction });
        });
    });

    // --- 6. 캔버스 프리뷰 렌더링 제거됨 ---


    // --- 7. 메인 창으로부터 메시지 수신 처리 (양방향 동기화 핵심) ---
    window.addEventListener('message', (event) => {
        if (event.data.type === 'DECO_LIST_UPDATE') {
            currentDecoList = event.data.data;
            selectedDecoId = event.data.selectedId;
            
            // 이전 단계에서 사용했던 fullDecoData 및 renderPreview 호출은 제거됨
            
            updateTouchPads(); 
        }
    });

    // --- 8. 초기 요청 ---
    window.onload = () => {
        sendMessage('REQUEST_DECO_LIST');
    };
});
