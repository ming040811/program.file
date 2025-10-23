// Firebase 객체(db)는 index.html에서 로드 및 초기화되었다고 가정합니다.

document.addEventListener('DOMContentLoaded', () => {
    // 1. 모드 판별 및 기본 변수 설정
    const urlParams = new URLSearchParams(window.location.search);
    const isControllerMode = urlParams.get('mode') === 'controller';
    
    // ⭐ 통신 핵심: Firestore 문서 경로 설정 (이 문서가 PC와 모바일의 '채팅방' 역할)
    const CONTROL_DOC_REF = db.collection('storyControls').doc('currentSession');

    // 기본 DOM 요소 (PC 모드에서만 사용)
    const canvas = document.getElementById('canvas');
    const openControllerBtn = document.getElementById('open-controller-btn');
    const verticalGuide = document.querySelector('.vertical-guide');
    const horizontalGuide = document.querySelector('.horizontal-guide');
    const guideContainer = document.querySelector('.guide-container');
    
    // QR 코드 관련 DOM 요소
    const qrModal = document.getElementById('qr-modal');
    const qrcodeDiv = document.getElementById('qrcode-container');
    const closeQrBtn = document.getElementById('close-qr-btn');

    // 스토리 데이터 (기존 로직 유지)
    const storyData = {
        '1': { background: '', decorations: [] }, 
        '2': { background: '', decorations: [] },
        '3': { background: '', decorations: [] }, '4': { background: '', decorations: [] },
        '5': { background: '', decorations: [] }, '6': { background: '', decorations: [] },
    };
    let currentScene = '1';
    let selectedDecoId = null; 
    let activeDecoId = null; // 모바일 컨트롤러에서 현재 조작 중인 아이템 ID
    
    // ⭐ 플래그: 명령 처리 중 PC가 상태를 재동기화하는 것을 방지
    let isUpdatingFromCommand = false; 

    // =========================================================================
    // ⭐ 🚨통신 핵심 로직: Firestore를 통한 데이터 송수신🚨 ⭐
    // =========================================================================

    // [PC 전용] PC -> Firestore (컨트롤러에 표시할 현재 상태 동기화)
    function syncStateToFirestore() {
        if (isUpdatingFromCommand) {
            return;
        }

        const decoList = storyData[currentScene].decorations.slice(0, 3).map((deco, index) => ({
            id: deco.id,
            index: index + 1
        }));
        
        const state = {
            scene: currentScene,
            selectedId: selectedDecoId,
            decoList: decoList,
            command: null, 
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        // Firestore의 'state' 필드에 상태를 저장합니다.
        CONTROL_DOC_REF.set({ state: state }, { merge: true })
            .catch(error => { console.error("Firestore 상태 동기화 실패: ", error); });
    }
    
    // [모바일 전용] 모바일 -> Firestore (조작 명령 전송)
    function sendCommandToFirestore(action, data = {}) {
        if (!activeDecoId && action !== 'select') {
            console.warn("조작할 아이템이 선택되지 않았습니다.");
            return;
        }
        const command = {
            id: activeDecoId || data.newId, 
            action: action,
            data: data,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        // Firestore의 'command' 필드에 명령을 저장합니다.
        CONTROL_DOC_REF.set({ command: command }, { merge: true })
            .catch(error => { console.error("Firestore 명령 전송 실패: ", error); });
            
        // 아이템 선택 명령은 모바일 UI도 즉시 업데이트할 수 있도록 데이터만 보냅니다.
    }


    // =========================================================================
    // ⭐ 모바일 컨트롤러 모드 (isControllerMode: true) 로직 ⭐
    // =========================================================================
    if (isControllerMode) {
        // PC UI 숨김 로직 (기존 코드와 동일)
        const pcHeader = document.querySelector('.app-header');
        const pcMain = document.querySelector('.app-main');
        const pcTimeline = document.querySelector('.timeline');
        if (pcHeader) pcHeader.style.display = 'none';
        if (pcMain) pcMain.style.display = 'none';
        if (pcTimeline) pcTimeline.style.display = 'none';
        
        // 모바일 컨트롤러 UI 표시
        const mobileUI = document.getElementById('mobile-controller-ui');
        if (mobileUI) mobileUI.style.display = 'flex';
        
        const statusEl = document.getElementById('controller-status');
        const selectionArea = document.getElementById('deco-selection');
        const touchpad = document.getElementById('touchpad');
        
        // 1. 상태 수신 및 UI 업데이트 (실시간 리스너 사용!)
        CONTROL_DOC_REF.onSnapshot(doc => {
            if (!doc.exists) {
                statusEl.textContent = "PC 사이트 로드 대기 중...";
                selectionArea.innerHTML = 'PC에서 아이템을 추가하세요.';
                return;
            }
            
            const data = doc.data();
            if (!data || !data.state) return;

            const state = data.state;
            statusEl.textContent = `Scene ${state.scene} 연결됨`;
            
            // 아이템 선택 버튼 업데이트
            selectionArea.innerHTML = '';
            
            if (state.decoList.length === 0) {
                selectionArea.innerHTML = '<p style="color:#aaa;">현재 씬에 아이템이 없습니다.</p>';
                activeDecoId = null;
                return;
            }

            let initialActiveId = activeDecoId || state.selectedId || (state.decoList.length > 0 ? state.decoList[0].id : null);
            
            state.decoList.forEach(deco => {
                const btn = document.createElement('button');
                btn.className = 'ctrl-deco-btn';
                btn.textContent = `아이템 ${deco.index}`;
                btn.dataset.id = deco.id;
                
                if (deco.id === initialActiveId) {
                    btn.style.backgroundColor = '#4F99B2';
                    btn.style.color = 'white';
                    activeDecoId = deco.id;
                } else {
                    btn.style.backgroundColor = '#fff';
                    btn.style.color = 'black';
                }
                btn.style.padding = '10px';
                btn.style.border = '1px solid #ccc';
