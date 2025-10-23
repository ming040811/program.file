/**
 * ---------------------------------------------------------------------------------
 * "AI" 내러티브 생성 로직 V14 (alt 속성값 비교)
 * ---------------------------------------------------------------------------------
 */

// [수정] URL 인코딩(한글) 문제를 해결한 헬퍼 함수
function getFilenameFromUrl(url) {
    if (!url) return null;
    let filename = '';
    try {
        // 1. http://.../img/낮.png 같은 전체 URL에서 경로 추출
        const path = new URL(url).pathname;
        filename = path.substring(path.lastIndexOf('/') + 1);
    } catch (e) {
        // 2. /img/낮.png 같은 상대 경로 또는 파일명만 있는 경우
        const lastSlashIndex = url.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
            filename = url.substring(lastSlashIndex + 1);
        } else {
            filename = url;
        }
    }
    
    // 3. 따옴표 제거 및 URL 디코딩 (예: '%EB%82%AE.png' -> '낮.png')
    filename = filename.replace(/['"]/g, '');
    try {
        return decodeURIComponent(filename);
    } catch (e) {
        // 디코딩 실패 시 원본 반환
        return filename;
    }
}


// 엔딩 분기를 결정하는 헬퍼 함수
function getEndingType(backgroundUrl) {
    if (!backgroundUrl || backgroundUrl === 'none') return 'happy';
    const filename = getFilenameFromUrl(backgroundUrl);
    if (filename === '밤.png' || filename === '비.png' || filename === '나무.png') {
        return 'sad';
    }
    return 'happy';
}

// ---------------------------------------------------------------------------------
// 8개 장면에 대한 "AI" 내러티브 데이터
// ---------------------------------------------------------------------------------
const narrativeData = {
    '1': {
        question: "1장: 가면 속의 만남\n로미오와 줄리엣이 처음 만난 장소는 어디일까요?",
        backgroundText: { // 키: 파일명
            '낮.png': "몬태규가의 로미오가 한낮의 거리를 걷다가",
            '밤.png': "몬태규가의 로미오가 달빛 아래를 걷다가",
            '비.png': "비 내리는 오후, 몬태규가의 로미오가",
            '눈.png': "함박눈 내리던 어느 날, 몬태규가의 로미오가",
            '계단.png': "몬태규가의 로미오가 웅장한 계단이 있는 곳을 지나다가",
            '도시.png': "도심 한가운데에서 몬태규가의 로미오가",
            '나무.png': "숲속에서 길을 잃은 몬태규가의 로미오가",
            'default': "몬태규가의 로미오가 길을 걷다가"
        },
        decorationText: { // 키: alt 속성값
            '집': " 외딴 오두막에서 여행 중이던 캐풀렛가의 줄리엣을 만납니다.",
            '성': " 성을 산책 중이던 캐풀렛가의 줄리엣을 만납니다.",
            '가로등': " 환한 가로등 아래에서 캐풀렛가의 줄리엣을 만납니다.",
            'default': " 우연히 캐풀렛가의 줄리엣을 만납니다."
        },
        finalText: {
            'default': "둘은 첫눈에 반하지만, 원수의 자식임을 알고 절망합니다."
        }
    },
    '2': {
        question: "2장: 달빛 아래 맹세\n로미오가 줄리엣의 고백을 엿들은 곳은 어디인가요?",
        backgroundText: {
            '낮.png': "아직 해가 지지 않은 낮이지만, 줄리엣을 잊지 못한 로미오가",
            '밤.png': "달빛이 비추는 밤, 줄리엣을 잊지 못한 로미오가",
            '비.png': "차가운 비가 내리는 밤, 로미오가",
            '눈.png': "소리 없이 눈이 내리는 밤, 로미오가",
            '계단.png': "그녀의 방으로 이어지는 계단 아래로 로미오가",
            '도시.png': "도시가 잠든 고요한 밤, 로미오가",
            '나무.png': "숲처럼 우거진 정원 나무 그늘 아래로 로미오가",
            'default': "줄리엣을 잊지 못한 로미오가 그녀를 찾아"
        },
        decorationText: { // 키: alt 속성값
            '집': " 그녀의 집 발코니를 올려다봅니다.",
            '성': " 그녀의 성 발코니를 올려다봅니다.",
            '가로등': " 희미한 가로등 불빛이 비추는 발코니를 올려다봅니다.",
            'default': " 그녀의 방 발코니를 올려다봅니다."
        },
        finalText: {
            'default': "줄리엣의 사랑 고백을 듣게 되며 두 사람은 영원한 사랑을 약속합니다."
        }
    },
    '3': {
        question: "3장: 성스러운 비밀\n두 사람의 비밀 결혼식은 어디서 열렸나요?",
        backgroundText: {
            '낮.png': "다음 날 낮, 두 사람은 조력자를 찾아가",
            '밤.png': "다음 날 어두운 밤, 두 사람은 사람들의 눈을 피해",
            '비.png': "비가 내리는 날, 두 사람은 비밀을 감춘 채",
            '눈.png': "눈이 내리는 날, 두 사람은 순결한 맹세를 위해",
            '계단.png': "예배당의 계단을 올라, 두 사람은",
            '도시.png': "도시의 작은 예배당으로, 두 사람은",
            '나무.png': "숲속 작은 예배당으로, 두 사람은",
            'default': "두 사람은 조력자를 찾아가"
        },
        decorationText: { // 키: alt 속성값
            '집': " 작은 집과 같은 예배당 안에서 조력자의 주례로 결혼합니다.",
            '성': " 비록 성은 아니지만, 경건한 예배당 안에서 조력자의 주례로 결혼합니다.",
            '가로등': " 촛불이 가로등처럼 두 사람을 비추는 예배당 안에서 조력자의 주례로 결혼합니다.",
            'default': " 예배당 안에서 조력자의 주례로 결혼합니다."
        },
        finalText: {
            'happy': "조력자는 이 결합이 두 가문의 '화해'를 이끌 것이라 믿으며 이들의 결합을 돕고, 둘은 신성한 부부의 연을 맺습니다.",
            'sad': "조력자는 이 결합이 두 가문의 '불행'을 끝내길 바라면서도 이들의 결합을 돕고, 둘은 신성한 부부의 연을 맺습니다."
        }
    },
    '4': {
        question: "4장: 광장의 결투\n비극적인 결투가 벌어진 장소는 어디인가요?",
        backgroundText: {
            '낮.png': "결혼식 직후, 뜨거운 태양 아래",
            '밤.png': "결혼식 직후, 어두운 밤의 광장에서",
            '비.png': "결혼식 직후, 비 내리는 거리에서",
            '눈.png': "결혼식 직후, 눈 내리는 혼란 속에서",
            '계단.png': "결혼식 직후, 광장 계단에서",
            '도시.png': "결혼식 직후, 도시 광장 한복판에서",
            '나무.png': "결혼식 직후, 광장 옆 나무 그늘에서",
            'default': "결혼식 직후, 거리에서"
        },
        decorationText: { // 키: alt 속성값
            '집': " 사람들이 지켜보는 집들 앞에서, 줄리엣의 사촌이 로미오를 도발합니다.",
            '성': " 저 멀리 캐풀렛가의 성이 보이는 광장에서, 줄리엣의 사촌이 로미오를 도발합니다.",
            '가로등': " 가로등이 켜지기 시작한 거리에서, 줄리엣의 사촌이 로미오를 도발합니다.",
            'default': " 줄리엣의 사촌이 로미오를 도발합니다."
        },
        finalText: {
            'default': "싸움을 말리던 로미오의 친구가 사촌의 칼에 다치게 됩니다."
        }
    },
    '5': {
        question: "5장: 슬픈 이별과 추방\n로미오와 줄리엣이 마지막 밤을 보낸 곳은 어디인가요?",
        backgroundText: {
            '낮.png': "친구를 다치게 한 죄로 추방 명령을 받고, 날이 밝기 전",
            '밤.png': "친구를 다치게 한 죄로 추방 전 마지막 밤,",
            '비.png': "친구를 다치게 한 죄로 추방당하는 슬픈 밤, 창밖에 비가 내립니다.",
            '눈.png': "친구를 다치게 한 죄로 추방당하는 차가운 밤, 눈이 내립니다.",
            '계단.png': "친구를 다치게 한 죄로 추방당하기 전, 마지막으로 그녀의 방 계단을 올라,",
            '도시.png': "친구를 다치게 한 죄로 추방당하기 전 밤, 도시가 잠든 사이,",
            '나무.png': "친구를 다치게 한 죄로 추방당하기 전 밤, 창밖 나무가 흔들립니다.",
            'default': "친구를 다치게 한 죄로 추방당하게 된 로미오."
        },
        decorationText: { // 키: alt 속성값
            '집': " 줄리엣의 집, 그녀의 방 안에서 두 사람은 마지막 밤을 보냅니다.",
            '성': " 줄리엣의 성, 그녀의 방 안에서 두 사람은 마지막 밤을 보냅니다.",
            '가로등': " 창밖 가로등 불빛이 꺼져갈 무렵, 두 사람은 마지막 밤을 보냅니다.",
            'default': " 그녀의 방에서 두 사람은 마지막 밤을 보냅니다."
        },
        finalText: {
            'default': "부부로서의 첫날밤이자 마지막 밤을 눈물로 함께한 뒤, 로미오는 도시를 떠나며 슬픈 이별을 맞이합니다."
        }
    },
    '6': {
        question: "6장: 강요된 약속\n줄리엣이 강제로 결혼을 약속하게 된 장소는 어디인가요?",
        backgroundText: {
            '낮.png': "로미오가 떠난 낮,",
            '밤.png': "절망적인 밤,",
            '비.png': "줄리엣의 마음처럼 비가 내리던 날,",
            '눈.png': "차가운 눈처럼 냉혹한 날,",
            '계단.png': "저택의 계단 아래서,",
            '도시.png': "도시의 명망 높은 다른 귀족과",
            '나무.png': "정원의 나무를 보며 로미오를 그리워하던 중,",
            'default': "로미오가 떠난 후,"
        },
        decorationText: { // 키: alt 속성값
            '집': " 줄리엣의 집에서 부모님은 그녀를 다른 귀족과 강제로 결혼시키려 합니다.",
            '성': " 줄리엣의 성에서 부모님은 그녀를 다른 귀족과 강제로 결혼시키려 합니다.",
            '가로등': " 가로등이 켜진 저녁, 부모님은 그녀의 슬픔을 오해하고 다른 귀족과의 결혼을 밀어붙입니다.",
            'default': " 부모님은 그녀를 다른 귀족과 강제로 결혼시키려 합니다."
        },
        finalText: {
            'default': "가문의 명예를 위한 결혼 강요에, 줄리엣은 거부할 수 없는 현실 앞에 깊은 절망에 빠집니다."
        }
    },
    '7': {
        question: "7장: 위험한 계획\n줄리엣이 조력자에게 비약을 받은 곳은 어디인가요?",
        backgroundText: {
            '낮.png': "다음 날 낮, 줄리엣은 마지막 희망을 안고 조력자를 찾아가",
            '밤.png': "늦은 밤, 줄리엣은 몰래 조력자의 예배당으로",
            '비.png': "비를 맞으며, 그녀는 절박한 심정으로 조력자에게",
            '눈.png': "눈길을 헤치고, 줄리엣은 조력자의 방으로",
            '계단.png': "다시 찾은 예배당 계단을 올라, 조력자에게",
            '도시.png': "도시 외곽의 예배당으로, 조력자를 찾아",
            '나무.png': "숲속 예배당으로, 조력자를 만나러",
            'default': "마지막 희망을 안고 줄리엣은 조력자를 찾아가"
        },
        decorationText: { // 키: alt 속성값
            '집': " 조력자의 작은 집(방)에서, 그녀는 42시간 동안 잠드는 비약을 건네받습니다.",
            '성': " 성으로 돌아가기 전, 그녀는 42시간 동안 잠드는 비약을 건네받습니다.",
            '가로등': " 가로등도 없는 어두운 예배당 안에서, 그녀는 42시간 동안 잠드는 비약을 건네받습니다.",
            'default': " 조력자의 방 안에서 그녀는 42시간 동안 잠드는 비약을 건네받습니다."
        },
        finalText: {
            'happy': "조력자는 '희망을 가지고' 이 계획을 알릴 편지를 로미오에게 급히 보냅니다.",
            'sad': "조력자는 '불길한 예감 속에서' 이 계획을 알릴 편지를 로미오에게 급히 보냅니다."
        }
    },
    '8': {
        question: "8장: 운명의 갈림길 (최종장)\n두 연인의 마지막은 어떻게 될까요?",
        backgroundText: {
            '낮.png': "다행히 날이 밝아, 전령은 무사히 길을 떠나",
            '밤.png': "하지만 폭풍우가 몰아치는 밤이라, 전령은 길을 떠나지 못하고",
            '비.png': "하지만 쏟아지는 비 때문에 길이 막혀, 전령은 제때 도착하지 못하고",
            '눈.png': "다행히 눈이 그쳐, 전령은 로미오를 향해 출발하여",
            '계단.png': "신속한 전령 덕분에, 편지는 로미오에게 빠르게",
            '도시.png': "도시를 가로지른 전령 덕분에, 편지는 로미오에게 무사히",
            '나무.png': "하지만 숲속을 헤매던 전령이 길을 잃어, 편지는",
            'default': "운명의 편지는 로미오를 향해 출발했지만,"
        },
        decorationText: { // 키: alt 속성값
            '집': " 줄리엣이 잠든 가문의 무덤(집)에",
            '성': " 줄리엣이 잠든 '성'처럼 거대한 무덤에",
            '가로등': " 꺼진 '가로등'이 비추는 무덤에",
            'default': " 줄리엣이 잠든 무덤에"
        },
        finalText: {
            'happy': " 편지를 전달받습니다. 로미오는 계획대로 그녀가 잠든 무덤으로 향하고, 깨어난 줄리엣과 재회합니다. 두 사람은 모두의 축복 속에 도시로 돌아와, 두 가문의 화해를 이끌어냅니다. (Happy Ending)",
            'sad': " 편지를 전달받지 못합니다. 줄리엣이 죽었다는 소식만 들은 로미오는 독약을 들고 무덤으로 달려옵니다. 그는 잠든 줄리엣 곁에서 숨을 거두고, 깨어난 줄리엣도 그를 따라 생을 마감합니다. 뒤늦게 두 가문은 화해합니다. (Sad Ending)"
        }
    }
};


// ---------------------------------------------------------------------------------
// DOMContentLoaded 이벤트 리스너
// ---------------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const verticalGuide = document.querySelector('.vertical-guide');
    const horizontalGuide = document.querySelector('.horizontal-guide');

    const storyTextContainer = document.querySelector('.story-text-container');
    const storyText = document.getElementById('story-text');

    const storyData = {
        '1': { background: '', decorations: [] }, '2': { background: '', decorations: [] },
        '3': { background: '', decorations: [] }, '4': { background: '', decorations: [] },
        '5': { background: '', decorations: [] }, '6': { background: '', decorations: [] },
        '7': { background: '', decorations: [] }, '8': { background: '', decorations: [] },
    };
    let currentScene = 1;

    // --- 꾸미기 아이템 클릭 리스너 ---
    document.querySelectorAll('.asset-item[data-type="decoration"]').forEach(item => {
        item.addEventListener('click', () => {
            const canvasImageSrc = item.dataset.canvasSrc || item.src;
            let initialWidth = 400, initialHeight = 400;

            if (canvasImageSrc.includes('가로등1-2.png')) {
                initialHeight = 400;
                initialWidth = (340 / 1200) * initialHeight;
            } else if (canvasImageSrc.includes('쌍가로등1-2.png')) {
                initialHeight = 400;
                initialWidth = (450 / 1200) * initialHeight;
            }

            const newDeco = {
                id: 'deco-' + Date.now(),
                src: canvasImageSrc,
                alt: item.alt, // alt 속성 저장
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

    // --- 배경 아이템 클릭 리스너 ---
    document.querySelectorAll('.asset-item[data-type="background"]').forEach(item => {
        item.addEventListener('click', () => {
            storyData[currentScene].background = item.src;
            renderScene(currentScene);
        });
    });

    // --- 렌더링 함수 ---
    function renderScene(sceneNumber) {
        const data = storyData[sceneNumber];
        
        if (!data) {
            console.error("Scene data not found for scene:", sceneNumber);
            return;
        }

        canvas.style.backgroundImage = data.background ? `url("${data.background}")` : 'none';

        Array.from(canvas.children).forEach(child => {
            if (child.classList.contains('decoration-item') && !child.classList.contains('story-text-container')) {
                child.remove();
            }
        });

        data.decorations.forEach(createDecorationElement);

        updateThumbnail(sceneNumber);
        updateNarrative();
    }

    // --- 꾸미기 엘리먼트 생성 ---
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
        const textContainer = canvas.querySelector('.story-text-container');
        if (textContainer) {
            canvas.insertBefore(item, textContainer);
        } else {
            canvas.appendChild(item);
        }
        makeInteractive(item);
    }

    // --- 인터랙션 함수 (꾸미기 전용) ---
    function makeInteractive(element) {
        const dataArray = storyData[currentScene].decorations;
        const decoData = dataArray.find(d => d.id === element.id);

        if (!decoData) return;

        // mousedown 리스너 (선택 로직)
        element.addEventListener('mousedown', (e) => {
            const isHandle = e.target.closest('.handle');
            const isControl = e.target.closest('.controls');

            if (!element.classList.contains('selected')) {
                document.querySelectorAll('.decoration-item').forEach(el => el.classList.remove('selected'));
                element.classList.add('selected');
            }

            e.stopPropagation();
            
            if (!isHandle && !isControl) {
                const textContainer = canvas.querySelector('.story-text-container');
                if (textContainer) {
                    canvas.insertBefore(element, textContainer);
                } else {
                    canvas.appendChild(element);
                }
            }
        });

        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        // 드래그 시작 로직 (onmousedown)
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
            const canvasWidth = canvas.offsetWidth, canvasHeight = canvas.offsetHeight;
            const elementWidth = element.offsetWidth, elementHeight = element.offsetHeight;
            const canvasCenterX = canvasWidth / 2, canvasCenterY = canvasHeight / 2;
            const elementCenterX = newLeft + elementWidth / 2, elementCenterY = newTop + elementHeight / 2;
            let snappedX = false, snappedY = false;

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
                const signX = isLeft ? -1 : 1, signY = isTop ? -1 : 1;
                const localCenter = { x: (signX * newWidth) / 2, y: (signY * newHeight) / 2 };
                const rotatedCenterVector = {
                    x: localCenter.x * Math.cos(angleRad) - localCenter.y * Math.sin(angleRad),
                    y: localCenter.x * Math.sin(angleRad) + localCenter.y * Math.cos(angleRad)
                };
                const newGlobalCenter = { x: pivot.x + rotatedCenterVector.x, y: pivot.y + rotatedCenterVector.y };
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
            const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
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

        // 좌우 반전 및 삭제 리스너
        element.querySelector('.flip').addEventListener('click', (e) => {
            e.stopPropagation(); // 버블링 방지
            decoData.scaleX *= -1;
            element.querySelector('img').style.transform = `scaleX(${decoData.scaleX})`;
            updateThumbnail(currentScene);
        });

        element.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation(); // 버블링 방지
            const index = dataArray.findIndex(d => d.id === element.id);
            if (index > -1) {
                dataArray.splice(index, 1);
                element.remove();
                updateThumbnail(currentScene);
                updateNarrative();
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

    // 캔버스 외부 클릭 시 선택 해제
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.decoration-item')) {
            document.querySelectorAll('.decoration-item').forEach(el => el.classList.remove('selected'));
        }
    });

    // --- 탭/씬 전환 로직 ---
    const tabs = document.querySelectorAll('.tab-button');
    const assetLists = document.querySelectorAll('.asset-list');
    const scenes = document.querySelectorAll('.scene');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            assetLists.forEach(list => list.style.display = 'none');
            const targetList = document.getElementById(tab.dataset.tab);
            if(targetList) targetList.style.display = 'grid';
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

    // --- 썸네일 업데이트 ---
    function updateThumbnail(sceneNumber) {
        const sceneEl = document.querySelector(`.scene[data-scene="${sceneNumber}"]`);
        if (sceneEl) {
            sceneEl.innerHTML = '';
            const sceneData = storyData[sceneNumber];
            
            if (!sceneData) return;

            sceneEl.style.backgroundImage = sceneData.background ? `url("${sceneData.background}")` : 'none';
            if(!canvas || canvas.offsetWidth === 0 || !sceneEl || sceneEl.offsetWidth === 0) return;
            const scaleX = sceneEl.offsetWidth / canvas.offsetWidth;
            const scaleY = sceneEl.offsetHeight / canvas.offsetHeight;

            sceneData.decorations.forEach(decoData => {
                const miniDeco = document.createElement('div');
                miniDeco.style.position = 'absolute';
                miniDeco.style.width = (decoData.width * scaleX) + 'px';
                miniDeco.style.height = (decoData.height * scaleY) + 'px';
                miniDeco.style.left = (decoData.x * scaleX) + 'px';
                miniDeco.style.top = (decoData.y * scaleY) + 'px';
                miniDeco.style.backgroundImage = `url("${decoData.src}")`;
                miniDeco.style.backgroundSize = 'contain';
                miniDeco.style.backgroundRepeat = 'no-repeat';
                miniDeco.style.backgroundPosition = 'center';
                miniDeco.style.transform = `rotate(${decoData.rotation}deg) scaleX(${decoData.scaleX})`;
                sceneEl.appendChild(miniDeco);
            });
        }
    }

    // --- 내러티브 업데이트 함수 ---
    function updateNarrative() {
        const sceneData = storyData[currentScene];
        const storyLogic = narrativeData[currentScene];

        if (!sceneData || !storyLogic) {
             console.error("Data or logic not found for scene:", currentScene);
             return; 
        }

        let fullText = "";

        // 현재 캔버스 배경 URL에서 파일명 추출
        const currentBgStyle = canvas.style.backgroundImage;

        const urlMatch = currentBgStyle.match(/url\(['"]?(.*?)['"]?\)/);
        const currentBgUrl = urlMatch ? urlMatch[1] : '';

        // [수정] 헬퍼 함수를 호출하여 디코딩된 파일명 사용
        const currentBgFilename = getFilenameFromUrl(currentBgUrl); 

        if (!currentBgFilename) { // 배경 파일명 없으면
            fullText = storyLogic.question;
            storyTextContainer.classList.add('default-text');
            storyTextContainer.classList.remove('narrative-text');
        } else {
            // 배경 파일명 있으면 내용 생성
            storyTextContainer.classList.remove('default-text');
            storyTextContainer.classList.add('narrative-text');
            
            // [수정] 이제 currentBgFilename이 '낮.png'로 정확히 인식됨
            const bgKey = storyLogic.backgroundText.hasOwnProperty(currentBgFilename) ? currentBgFilename : 'default';
            fullText = storyLogic.backgroundText[bgKey];

            // 꾸미기 추가 시
            const firstDeco = sceneData.decorations[0];
            
            if (firstDeco) {
                const decoAlt = firstDeco.alt; 
                let decoKey = 'default';

                if (storyLogic.decorationText.hasOwnProperty(decoAlt)) {
                    decoKey = decoAlt;
                }

                fullText += storyLogic.decorationText[decoKey];
            }

            // 결말 추가 로직
            const ending = getEndingType(currentBgUrl);
            const finalTextLogic = storyLogic.finalText;

            if (finalTextLogic[ending]) {
                fullText += "\n" + finalTextLogic[ending];
            } else {
                fullText += "\n" + finalTextLogic['default'];
            }
        }
        storyText.innerText = fullText;
    }

    // 페이지 로드 시 썸네일 초기화
    document.querySelectorAll('.scene').forEach(scene => {
        setTimeout(() => updateThumbnail(scene.dataset.scene), 100);
    });

    // 페이지 로드 시 첫 장면 렌더링
    renderScene(currentScene);
});