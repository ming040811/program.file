document.addEventListener('DOMContentLoaded', () => {
    const controllerArea = document.getElementById('controller-area');
    const statusScene = document.getElementById('current-scene');
    const statusDecoIndex = document.getElementById('selected-deco-index');
    const nextItemBtn = document.getElementById('next-item-btn');
    
    let activeDecorations = []; // 꾸미기 사이트에서 받은 아이템 목록
    let selectedDecoIndex = 0; // 현재 선택된 아이템의 인덱스 (0: 선택 없음, 1, 2, 3)
    let targetWindow = null;
    let currentScene = 1;

    // --- 1. 꾸미기 사이트와 연결 설정 ---
    function connectToOpener() {
        if (window.opener && !window.opener.closed) {
            targetWindow = window.opener;
            // 초기 연결 시 꾸미기 사이트의 상태를 요청
            targetWindow.postMessage({ type: 'REQUEST_DECO_LIST' }, '*');
        } else {
            console.warn('꾸미기 사이트가 열려 있지 않거나 창이 닫혔습니다.');
        }
    }
    connectToOpener();

    // --- 2. 꾸미기 사이트로부터 메시지 수신 처리 ---
    window.addEventListener('message', (event) => {
        // 보안을 위해 origin 체크를 하는 것이 좋지만, 여기서는 '*'를 사용합니다.
        if (event.data.type === 'DECO_LIST_UPDATE') {
            activeDecorations = event.data.data;
            currentScene = event.data.scene;
            
            // 컨트롤러 UI 업데이트
            updateControllerUI();
            updateStatus();
        }
    });

    // --- 3. 컨트롤러 UI 동적 생성/업데이트 ---
    function updateControllerUI() {
        controllerArea.innerHTML = '';
        
        // 아이템 수(최대 3개)에 따라 컨트롤 버튼 생성
        activeDecorations.forEach((deco, index) => {
            const container = document.createElement('div');
            container.className = 'control-container';
            container.dataset.index = index + 1; // 1부터 3까지 인덱스 부여

            const moveBtn = createButton(`Move ${index + 1}`, 'move');
            const rotateBtn = createButton(`Rotate ${index + 1}`, 'rotate');
            const scaleBtn = createButton(`Scale ${index + 1}`, 'scale');
            
            // 현재 선택된 아이템에 'active' 클래스 적용
            if (index + 1 === selectedDecoIndex) {
                 moveBtn.classList.add('active');
                 rotateBtn.classList.add('active');
                 scaleBtn.classList.add('active');
            }

            container.append(moveBtn, rotateBtn, scaleBtn);
            controllerArea.appendChild(container);
        });
    }
    
    function createButton(text, action) {
        const button = document.createElement('div');
        button.className = 'joystick-button';
        button.textContent = text.split(' ')[0]; // 예시로 'Move'만 표시
        button.dataset.action = action;
        
        // 버튼 클릭 이벤트 처리
        button.addEventListener('mousedown', (e) => startControl(e, action));
        button.addEventListener('touchstart', (e) => startControl(e, action));
        
        return button;
    }

    // --- 4. 상태 표시 업데이트 ---
    function updateStatus() {
        statusScene.textContent = currentScene;
        if (selectedDecoIndex > 0) {
            statusDecoIndex.textContent = selectedDecoIndex;
        } else {
            statusDecoIndex.textContent = '없음';
        }
    }

    // --- 5. 아이템 선택 전환 로직 ---
    nextItemBtn.addEventListener('click', () => {
        if (activeDecorations.length === 0) {
            selectedDecoIndex = 0;
            return;
        }

        // 현재 선택된 인덱스에서 다음 인덱스로 전환 (순환)
        selectedDecoIndex = (selectedDecoIndex % activeDecorations.length) + 1;
        
        // 컨트롤러 UI 및 상태 업데이트
        updateControllerUI();
        updateStatus();

        // 꾸미기 사이트에 현재 선택된 아이템을 알림
        const selectedDecoId = activeDecorations.find(deco => deco.index === selectedDecoIndex)?.id;
        if (targetWindow) {
            targetWindow.postMessage({
                type: 'DECO_SELECT',
                id: selectedDecoId 
            }, '*');
        }
    });

    // --- 6. 컨트롤 (조이스틱) 작동 로직 ---
    function startControl(e, action) {
        if (!targetWindow || selectedDecoIndex === 0) return;
        
        e.preventDefault();
        const button = e.currentTarget;
        const decoIndex = parseInt(button.closest('.control-container').dataset.index);
        const decoId = activeDecorations.find(d => d.index === decoIndex)?.id;
        
        if (!decoId) return;

        // 아이템 선택이 현재 버튼과 일치하지 않으면 해당 아이템을 선택
        if (decoIndex !== selectedDecoIndex) {
            selectedDecoIndex = decoIndex;
            updateControllerUI();
            updateStatus();
            targetWindow.postMessage({ type: 'DECO_SELECT', id: decoId }, '*');
        }
        
        // ⭐ 실제 컨트롤러 작동 로직 (예시) ⭐
        // 여기서는 버튼을 누르고 있는 동안 꾸미기 사이트에 지속적인 명령을 보냅니다.
        
        let interval;
        const sendCommand = (direction) => {
             targetWindow.postMessage({
                type: 'DECO_CONTROL',
                id: decoId,
                action: action, // 'move', 'rotate', 'scale'
                direction: direction // 'up', 'down', 'left', 'right' 등
            }, '*');
        };

        // 임시 로직: 버튼 누름을 지속적인 'Move Up' 명령으로 간주
        sendCommand('UP'); 
        
        // 마우스/터치 해제 시 이벤트 리스너 추가
        const stopControl = () => {
            clearInterval(interval);
            document.removeEventListener('mouseup', stopControl);
            document.removeEventListener('touchend', stopControl);
        };

        // 인터벌로 지속적인 명령을 보내는 경우
        /*
        interval = setInterval(() => {
            sendCommand('UP'); 
        }, 100); 
        */

        document.addEventListener('mouseup', stopControl);
        document.addEventListener('touchend', stopControl);
    }
    
    // 초기 UI 설정
    updateControllerUI();
    updateStatus();
});