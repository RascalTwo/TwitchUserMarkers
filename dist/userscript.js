define("types", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("ui", ["require", "exports", "helpers", "twitch"], function (require, exports, helpers_1, twitch_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.generateMarkerList = exports.dialog = exports.changeDialogCount = exports.getDialogCount = void 0;
    let openDialogs = 0;
    function getDialogCount() {
        return openDialogs;
    }
    exports.getDialogCount = getDialogCount;
    function changeDialogCount(change) {
        openDialogs += change;
        return openDialogs;
    }
    exports.changeDialogCount = changeDialogCount;
    /**
     * Show customizable dialog
     *
     * @param {'alert' | 'prompt' | 'choose'} type
     * @param {string} message
     * @param {(form: HTMLFormElement) => any} sideEffect
     */
    async function dialog(type, message, sideEffect) {
        return new Promise(resolve => {
            openDialogs++;
            let canceled = false;
            const form = document.createElement('form');
            form.style.position = 'absolute';
            form.style.zIndex = (9000 + openDialogs).toString();
            form.style.top = '50%';
            form.style.left = '50%';
            form.style.transform = 'translate(-50%, -50%)';
            form.style.backgroundColor = '#18181b';
            form.style.padding = '1em';
            form.style.borderRadius = '1em';
            form.style.color = 'white';
            form.style.display = 'flex';
            form.style.flexDirection = 'column';
            form.textContent = message;
            const handleSubmit = (e) => {
                e?.preventDefault();
                const response = canceled ? null : generateResponse(form);
                form.remove();
                openDialogs--;
                removeEscapeHandler();
                return resolve(response);
            };
            form.addEventListener('submit', handleSubmit);
            const [generateResponse, pre, post, afterCreated] = {
                alert: () => [
                    () => true,
                    () => form.querySelector('button[type="submit"]').focus(),
                    helpers_1.NOOP,
                    sideEffect,
                ],
                prompt: () => {
                    const [type, value] = sideEffect?.(form) ?? ['input', ''];
                    const input = document.createElement(type);
                    input.value = value;
                    if (type === 'textarea')
                        input.setAttribute('rows', 10);
                    input.addEventListener('keydown', (e) => e.key === 'Enter' && e.ctrlKey ? handleSubmit() : undefined);
                    form.appendChild(input);
                    return [
                        () => input.value.trim(),
                        () => input.focus(),
                        () => {
                            const lines = input.value.split('\n');
                            const longestLine = Math.max(...lines.map(line => line.length));
                            if (!longestLine)
                                return;
                            input.style.width = Math.max(input.offsetWidth, longestLine * (0, helpers_1.chToPx)()) + 'px';
                        },
                        helpers_1.NOOP,
                    ];
                },
                choose: () => {
                    form.appendChild(Object.entries(sideEffect(form)).reduce((fragment, [key, value]) => {
                        const button = document.createElement('button');
                        button.className = (0, twitch_1.getButtonClass)();
                        button.textContent = key;
                        button.value = JSON.stringify(value);
                        button.addEventListener('click', () => (form.dataset.value = button.value));
                        form.dataset.value = JSON.stringify(null);
                        fragment.appendChild(button);
                        return fragment;
                    }, document.createDocumentFragment()));
                    return [
                        () => JSON.parse(form.dataset.value),
                        () => {
                            form.querySelector('button[type="submit"]').remove();
                            form.querySelector('button').focus();
                        },
                        helpers_1.NOOP,
                        helpers_1.NOOP,
                    ];
                },
            }[type]();
            const actions = document.createElement('div');
            actions.style.flex = '1';
            actions.style.display = 'flex';
            const submit = document.createElement('button');
            submit.className = (0, twitch_1.getButtonClass)();
            submit.style.flex = '1';
            submit.textContent = 'OK';
            submit.type = 'submit';
            actions.appendChild(submit);
            const cancel = document.createElement('button');
            cancel.className = (0, twitch_1.getButtonClass)();
            cancel.style.flex = '1';
            cancel.textContent = 'Cancel';
            cancel.addEventListener('click', () => (canceled = true));
            actions.appendChild(cancel);
            form.appendChild(actions);
            document.body.appendChild(form);
            const removeEscapeHandler = (0, helpers_1.attachEscapeHandler)(handleSubmit, () => form.style.zIndex === (9000 + openDialogs).toString());
            setTimeout(() => {
                pre(form);
                afterCreated?.(form);
                post(form);
            });
        });
    }
    exports.dialog = dialog;
    const generateMarkerList = (markers, getCurrentTimeLive, handleMarkerUpdate, setTime, startEditingMarker, seekToMarker) => {
        function deleteMarker(marker) {
            const index = markers.findIndex(m => m.seconds === marker.seconds);
            markers.splice(index, 1);
            return handleMarkerUpdate();
        }
        function adjustMarkerSeconds(marker, change) {
            marker.seconds += change;
            return handleMarkerUpdate().then(() => marker);
        }
        let rendering = false;
        let last = { x: 0, y: 0, top: window.innerHeight / 10, left: window.innerWidth / 10 };
        const closeFuncs = [];
        const uninstallFuncs = [];
        function appendMarkerListCSS() {
            if (document.querySelector('.r2_marker_list_style'))
                return () => undefined;
            const style = document.createElement('style');
            style.className = 'r2_marker_list_style';
            style.appendChild(document.createTextNode(`
		/* Scrollbar Styles */
		.r2_marker_list::-webkit-scrollbar {
			width: 7.5px;
		}

		.r2_marker_list::-webkit-scrollbar-track {
			background: transparent;
		}

		.r2_marker_list::-webkit-scrollbar-thumb {
			background-color: rgb(24, 24, 27);
			border-radius: 7px;
			border: 1px solid rgb(239, 239, 241);
		}

		/* Resizing Styles */
		.r2_marker_list::-webkit-resizer {
			border: 3px solid white;
			background: transparent;
			cursor: nwse-resize;
		}
	`));
            document.querySelector('head').appendChild(style);
            return () => style.remove();
        }
        const getCurrentMarkerLI = (list) => getCurrentTimeLive().then(now => list.querySelectorAll('li')[(markers
            .map((c, i) => [c, i])
            .filter(([c]) => Math.floor(c.seconds) <= now)
            .slice(-1)[0] ?? [null, -1])[1]]);
        function renderMarkerList() {
            if (!rendering)
                return removeMarkerList();
            uninstallFuncs.push(appendMarkerListCSS());
            const existingList = document.querySelector('.r2_marker_list');
            const list = existingList || document.createElement('ul');
            if (!existingList) {
                const keydownHandler = (e) => {
                    const target = e.target;
                    if (['INPUT', 'TEXTAREA'].includes(target.tagName) ||
                        target.getAttribute('role') === 'textbox')
                        return;
                    const { key } = e;
                    const active = list.querySelector('li[data-r2_active_marker="true"]');
                    if (key === 'w' || key === 's') {
                        if (!active)
                            makeActive(list.querySelector('li'));
                        else if (key === 'w' && active.previousElementSibling?.tagName === 'LI')
                            makeActive(active.previousElementSibling);
                        else if (key === 's' && active.nextElementSibling?.tagName === 'LI')
                            makeActive(active.nextElementSibling);
                        else {
                            return;
                        }
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    else if (key === 'a' || key === 'd') {
                        if (!active)
                            return;
                        e.preventDefault();
                        e.stopPropagation();
                        return adjustMarkerSeconds(getElementMarker({ target: active }), key === 'a' ? -1 : 1).then(marker => ((0, twitch_1.isVOD)() ? setTime(marker.seconds) : undefined));
                    }
                    else if (key === 'n' && active) {
                        return startEditingMarker(getElementMarker({ target: active }), false, true, e);
                    }
                    else if ((0, twitch_1.isVOD)() && (key === 'q' || key === 'e'))
                        getCurrentTimeLive().then(seconds => setTime(seconds + (key === 'q' ? -1 : 1)));
                };
                window.addEventListener('keydown', keydownHandler);
                closeFuncs.push(() => window.removeEventListener('keydown', keydownHandler));
                list.className = 'r2_marker_list';
                list.style.position = 'absolute';
                list.style.zIndex = (9000 + getDialogCount()).toString();
                list.style.backgroundColor = '#18181b';
                list.style.padding = '1em';
                list.style.borderRadius = '1em';
                list.style.color = 'white';
                list.style.display = 'flex';
                list.style.gap = '0.5em';
                list.style.flexDirection = 'column';
                list.style.maxHeight = '75vh';
                list.style.maxWidth = '50vw';
                list.style.overflow = 'scroll';
                list.style.overflowX = 'auto';
                list.style.resize = 'both';
                list.style.top = last.top + 'px';
                list.style.left = last.left + 'px';
                const header = document.createElement('h4');
                header.textContent = 'Marker List';
                header.style.backgroundColor = '#08080b';
                header.style.userSelect = 'none';
                header.style.padding = '0';
                header.style.margin = '0';
                let dragging = false;
                list.addEventListener('mousedown', e => {
                    if (Math.abs(list.offsetLeft - e.clientX) >= (list.offsetWidth / 10) * 9 &&
                        Math.abs(list.offsetTop - e.clientY) >= (list.offsetHeight / 10) * 9)
                        return;
                    dragging = true;
                    last.x = e.clientX;
                    last.y = e.clientY;
                });
                const handleMouseUp = () => {
                    dragging = false;
                };
                document.body.addEventListener('mouseup', handleMouseUp);
                const handleMouseMove = (e) => {
                    if (!dragging)
                        return;
                    list.style.top = list.offsetTop - (last.y - e.clientY) + 'px';
                    list.style.left = list.offsetLeft - (last.x - e.clientX) + 'px';
                    last.x = e.clientX;
                    last.y = e.clientY;
                    last.top = parseInt(list.style.top);
                    last.left = parseInt(list.style.left);
                };
                document.body.addEventListener('mousemove', handleMouseMove);
                list.appendChild(header);
                uninstallFuncs.push(() => {
                    document.body.removeEventListener('mousemove', handleMouseMove);
                    document.body.removeEventListener('mouseup', handleMouseUp);
                });
                const closeButton = document.createElement('button');
                closeButton.className = (0, twitch_1.getButtonClass)();
                closeButton.style.float = 'right';
                closeButton.textContent = 'Close';
                closeButton.addEventListener('click', () => setMarkerList(false));
                header.appendChild(closeButton);
                uninstallFuncs.push((0, helpers_1.attachEscapeHandler)(() => setMarkerList(false), () => list.style.zIndex === (9000 + getDialogCount()).toString()));
            }
            markers.sort((a, b) => a.seconds - b.seconds);
            const places = (0, helpers_1.secondsToDHMS)(markers[markers.length - 1]?.seconds ?? 0).split(':').length;
            function getElementMarker(e) {
                const seconds = Number(e.target.closest('[data-seconds]').dataset.seconds);
                return markers.find(marker => marker.seconds === seconds);
            }
            const makeActive = (li, seekTo = true) => {
                list.querySelectorAll('li[data-r2_active_marker="true"]').forEach(otherLi => {
                    delete otherLi.dataset.r2_active_marker;
                    otherLi.style.backgroundColor = '';
                });
                li.dataset.r2_active_marker = 'true';
                li.style.backgroundColor = 'black';
                li.scrollIntoView();
                if (seekTo && (0, twitch_1.isVOD)())
                    return setTime(getElementMarker({ target: li }).seconds);
            };
            for (const [i, marker] of markers.entries()) {
                const existingLi = list.querySelectorAll('li')[i];
                const li = existingLi || document.createElement('li');
                li.dataset.seconds = marker.seconds.toString();
                if (!existingLi) {
                    li.style.display = 'flex';
                    li.style.gap = '1em';
                    li.style.alignItems = 'center';
                }
                const timeContent = (0, helpers_1.secondsToDHMS)(marker.seconds, places);
                const time = li.querySelector('span') || document.createElement('span');
                if (!existingLi) {
                    time.style.fontFamily = 'monospace';
                    time.addEventListener('wheel', e => {
                        makeActive(li);
                        // Stop native scrolling
                        e.preventDefault();
                        return adjustMarkerSeconds(getElementMarker(e), Math.min(Math.max(e.deltaY, -1), 1)).then(marker => ((0, twitch_1.isVOD)() ? setTime(marker.seconds) : undefined));
                    });
                    const decrease = document.createElement('button');
                    decrease.className = (0, twitch_1.getButtonClass)();
                    decrease.textContent = '-';
                    decrease.title = 'Subtract 1 second';
                    decrease.addEventListener('click', e => {
                        makeActive(li);
                        adjustMarkerSeconds(getElementMarker(e), -1).then(marker => (0, twitch_1.isVOD)() ? setTime(marker.seconds) : undefined);
                    });
                    time.appendChild(decrease);
                    const timeText = document.createElement('span');
                    timeText.textContent = timeContent;
                    if ((0, twitch_1.isVOD)()) {
                        timeText.style.cursor = 'pointer';
                        timeText.addEventListener('click', e => {
                            makeActive(li);
                            seekToMarker(getElementMarker(e), e);
                        });
                    }
                    timeText.addEventListener('contextmenu', e => {
                        makeActive(li);
                        startEditingMarker(getElementMarker(e), true, false, e);
                    });
                    time.appendChild(timeText);
                    const increase = document.createElement('button');
                    increase.className = (0, twitch_1.getButtonClass)();
                    increase.textContent = '+';
                    increase.title = 'Add 1 second';
                    increase.addEventListener('click', e => {
                        makeActive(li);
                        adjustMarkerSeconds(getElementMarker(e), 1).then(marker => (0, twitch_1.isVOD)() ? setTime(marker.seconds) : undefined);
                    });
                    time.appendChild(increase);
                    li.appendChild(time);
                }
                else {
                    time.childNodes[1].textContent = timeContent;
                }
                const title = li.querySelector('span.r2_marker_title') || document.createElement('span');
                if (!existingLi) {
                    title.className = 'r2_marker_title';
                    title.style.flex = '1';
                    title.style.textAlign = 'center';
                    if ((0, twitch_1.isVOD)()) {
                        title.style.cursor = 'pointer';
                        title.addEventListener('click', e => {
                            makeActive(li);
                            seekToMarker(getElementMarker(e), e);
                        });
                    }
                    title.addEventListener('contextmenu', e => startEditingMarker(getElementMarker(e), false, true, e));
                    li.appendChild(title);
                }
                title.textContent = marker.name;
                const share = li.querySelector('button.r2_marker_share') ||
                    document.createElement('button');
                if (!existingLi) {
                    share.className = (0, twitch_1.getButtonClass)();
                    share.classList.add('r2_marker_share');
                    share.style.float = 'right';
                    share.textContent = 'Share';
                    share.addEventListener('click', async (e) => navigator.clipboard.writeText(`https://twitch.tv/videos/${await (0, twitch_1.getVideoID)(false)}?t=${(0, twitch_1.generateTwitchTimestamp)(getElementMarker(e).seconds)}`));
                    li.appendChild(share);
                }
                const deleteBtn = li.querySelector('button.r2_marker_delete') ||
                    document.createElement('button');
                if (!existingLi) {
                    deleteBtn.className = (0, twitch_1.getButtonClass)();
                    deleteBtn.classList.add('r2_marker_delete');
                    deleteBtn.style.float = 'right';
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.addEventListener('click', e => {
                        deleteMarker(getElementMarker(e));
                        li.remove();
                    });
                    li.appendChild(deleteBtn);
                }
                if (!existingLi)
                    list.appendChild(li);
            }
            if (!existingList) {
                const closeButton = document.createElement('button');
                closeButton.className = (0, twitch_1.getButtonClass)();
                closeButton.style.float = 'right';
                closeButton.textContent = 'Close';
                closeButton.addEventListener('click', () => setMarkerList(false));
                list.appendChild(closeButton);
                document.body.appendChild(list);
                (0, helpers_1.delay)(0)
                    .then(() => getCurrentMarkerLI(list))
                    .then(li => {
                    if (!li)
                        return;
                    li.scrollIntoView();
                    makeActive(li, false);
                });
            }
        }
        function removeMarkerList() {
            document.querySelector('.r2_marker_list')?.remove();
            closeFuncs.forEach(close => close());
            closeFuncs.splice(0, closeFuncs.length);
        }
        uninstallFuncs.push(removeMarkerList);
        const setMarkerList = (render) => {
            rendering = render;
            changeDialogCount(Number(render));
            renderMarkerList();
        };
        const uninstallMarkerList = (() => {
            let lastLi = null;
            const interval = setInterval(() => {
                const list = document.querySelector('.r2_marker_list');
                return !list
                    ? null
                    : getCurrentMarkerLI(list).then(li => {
                        if (!li)
                            return;
                        li.style.backgroundColor = 'black';
                        if (li === lastLi)
                            return;
                        if (lastLi)
                            lastLi.style.backgroundColor = '';
                        lastLi = li;
                    });
            }, 1000);
            uninstallFuncs.forEach(func => func());
            return () => clearInterval(interval);
        })();
        return {
            removeMarkerList,
            renderMarkerList,
            setMarkerList,
            uninstallMarkerList,
        };
    };
    exports.generateMarkerList = generateMarkerList;
});
define("twitch", ["require", "exports", "helpers", "ui"], function (require, exports, helpers_2, ui_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.generateTwitchTimestamp = exports.getLoginName = exports.isLive = exports.isVOD = exports.getButtonClass = exports.clearIDsCache = exports.getVideoID = exports.getUserID = void 0;
    const GQL_HEADERS = {
        // cspell:disable-next-line
        'client-id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
    };
    let userID = undefined;
    let vid = undefined;
    /**
     * Get the ID of the page user
     *
     * @returns {number}
     */
    async function getUserID() {
        if (userID)
            return userID;
        // TODO - optimize GQL query
        return fetch('https://gql.twitch.tv/gql', {
            headers: GQL_HEADERS,
            body: `{"query":"query($login: String!, $skip: Boolean!) {\\n\\t\\t\\t\\tuser(login: $login) {\\n\\t\\t\\t\\t\\tbroadcastSettings {\\n\\t\\t\\t\\t\\t\\tlanguage\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\tcreatedAt\\n\\t\\t\\t\\t\\tdescription\\n\\t\\t\\t\\t\\tdisplayName\\n\\t\\t\\t\\t\\tfollowers {\\n\\t\\t\\t\\t\\t\\ttotalCount\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\tid\\n\\t\\t\\t\\t\\tlastBroadcast {\\n\\t\\t\\t\\t\\t\\tstartedAt\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\tprimaryTeam {\\n\\t\\t\\t\\t\\t\\tdisplayName\\n\\t\\t\\t\\t\\t\\tname\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\tprofileImageURL(width: 70)\\n\\t\\t\\t\\t\\tprofileViewCount\\n\\t\\t\\t\\t\\tself @skip(if: $skip) {\\n\\t\\t\\t\\t\\t\\tcanFollow\\n\\t\\t\\t\\t\\t\\tfollower {\\n\\t\\t\\t\\t\\t\\t\\tdisableNotifications\\n\\t\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t}\\n\\t\\t\\t}","variables":{"login":"${getLoginName()}","skip":false}}`,
            method: 'POST',
        })
            .then(r => r.json())
            .then(json => {
            userID = json.data.user.id;
            (0, helpers_2.log)('GQL User ID:', userID);
            return userID;
        });
    }
    exports.getUserID = getUserID;
    /**
     * Get ID of video, may not exist if on live page and archive stream does not exist
     *
     * @param {boolean} promptUser If to prompt the user for the ID if it could not be found
     * @returns {string}
     */
    async function getVideoID(promptUser) {
        // Get VID from URL if VOD
        if (isVOD()) {
            vid = window.location.href.split('/').slice(-1)[0].split('?')[0];
            return vid;
        }
        if (promptUser && vid === null) {
            const response = await (0, ui_1.dialog)('prompt', 'Video ID could not be detected, please provide it:');
            if (!response)
                return vid;
            vid = response;
        }
        if (vid !== undefined)
            return vid;
        // TODO - optimize GQL query
        return getUserID()
            .then(uid => fetch('https://gql.twitch.tv/gql', {
            headers: GQL_HEADERS,
            body: `{"query":"query($id: ID!, $all: Boolean!) {\\n\\t\\t\\t\\t\\tuser(id: $id) {\\n\\t\\t\\t\\t\\t\\tbroadcastSettings {\\n\\t\\t\\t\\t\\t\\t\\tgame {\\n\\t\\t\\t\\t\\t\\t\\t\\tdisplayName\\n\\t\\t\\t\\t\\t\\t\\t\\tname\\n\\t\\t\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\t\\t\\ttitle\\n\\t\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\t\\tlogin\\n\\t\\t\\t\\t\\t\\tstream {\\n\\t\\t\\t\\t\\t\\t\\tarchiveVideo @include(if: $all) {\\n\\t\\t\\t\\t\\t\\t\\t\\tid\\n\\t\\t\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\t\\t\\tcreatedAt\\n\\t\\t\\t\\t\\t\\t\\tid\\n\\t\\t\\t\\t\\t\\t\\ttype\\n\\t\\t\\t\\t\\t\\t\\tviewersCount\\n\\t\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t}","variables":{"id":"${uid}","all":true}}`,
            method: 'POST',
        }))
            .then(r => r.json())
            .then(json => {
            vid = json.data.user.stream.archiveVideo?.id ?? null;
            (0, helpers_2.log)('GQL VOD ID:', vid);
            return getVideoID(promptUser);
        });
    }
    exports.getVideoID = getVideoID;
    function clearIDsCache() {
        userID = undefined;
        vid = undefined;
    }
    exports.clearIDsCache = clearIDsCache;
    /**
     * Get CSS class of twitch buttons
     *
     * @returns {string}
     */
    function getButtonClass() {
        return (document.querySelector('[data-a-target="top-nav-get-bits-button"]')?.className ??
            document.querySelector('[data-a-target="login-button"]')?.className ??
            '');
    }
    exports.getButtonClass = getButtonClass;
    /**
     * If the page is a VOD
     *
     * @returns {boolean}
     */
    function isVOD() {
        return window.location.pathname.startsWith('/videos');
    }
    exports.isVOD = isVOD;
    /**
     * If the page is Live
     *
     * @returns {boolean}
     */
    function isLive() {
        const parts = window.location.pathname.split('/').slice(1);
        // @ts-ignore
        if (!parts.length === 1 && !!parts[0])
            return false;
        return !!document.querySelector('.user-avatar-card__live');
    }
    exports.isLive = isLive;
    /**
     * Get the username/loginName of the current page
     *
     * @returns {string}
     */
    function getLoginName() {
        return isLive()
            ? // URL ends with loginName
                window.location.pathname.split('/')[1]
            : // URL channel=loginName exists in `og:video` metadata
                new URLSearchParams(document
                    .querySelector('meta[property="og:video"]')
                    .getAttribute('content')
                    .split('?')
                    .slice(1)
                    .join('?')).get('channel');
    }
    exports.getLoginName = getLoginName;
    function generateTwitchTimestamp(seconds) {
        const symbols = ['d', 'h', 'm'];
        const dhms = Array.from((0, helpers_2.secondsToDHMS)(seconds));
        // 0:1:2:3 -> 0:1:2m3 -> 0:1h2m3 -> 0d1h2m3
        while (true) {
            const index = dhms.lastIndexOf(':');
            if (index === -1)
                break;
            dhms[index] = symbols.pop();
        }
        return dhms.join('') + 's';
    }
    exports.generateTwitchTimestamp = generateTwitchTimestamp;
});
define("helpers", ["require", "exports", "formatters", "twitch"], function (require, exports, formatters_1, twitch_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createUninstaller = exports.saveToLocalStorage = exports.loadFromLocalStorage = exports.attachEscapeHandler = exports.trackDelay = exports.secondsToDHMS = exports.DHMStoSeconds = exports.clickNodes = exports.delay = exports.chToPx = exports.NOOP = exports.log = void 0;
    function log(...args) {
        console.log('[R2 Twitch User-Markers]', ...args);
    }
    exports.log = log;
    /**
     * Do nothing
     */
    function NOOP() { }
    exports.NOOP = NOOP;
    /**
     * Get the Pixel width of the `ch` unit
     *
     * @returns {number}
     */
    function chToPx() {
        const node = document.createElement('div');
        node.style.position = 'absolute';
        node.textContent = 'M';
        document.body.appendChild(node);
        const width = node.offsetWidth;
        node.remove();
        return width;
    }
    exports.chToPx = chToPx;
    /**
     * Delay execution by {@link ms milliseconds}
     *
     * @param {number} ms
     */
    function delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
    exports.delay = delay;
    /**
     * Click nodes one by one in {@link queries}, waiting until they are in the DOM one by one
     *
     *
     * @param  {...any} queries queries of nodes to click
     */
    async function clickNodes(...queries) {
        for (const query of queries) {
            while (true) {
                const node = document.querySelector(query);
                if (node) {
                    node.click();
                    break;
                }
                else {
                    await delay(100);
                }
            }
        }
    }
    exports.clickNodes = clickNodes;
    /**
     * Convert DHMS to seconds, each part is optional except seconds
     *
     * @param {number[]} parts DHMS numeric parts
     * @returns {number} seconds
     */
    function DHMStoSeconds(parts) {
        // seconds
        if (parts.length === 1)
            return parts[0];
        // minutes:seconds
        else if (parts.length === 2)
            return parts[0] * 60 + parts[1];
        // hours:minutes:seconds
        else if (parts.length === 3)
            return parts[0] * 60 * 60 + parts[1] * 60 + parts[2];
        // days:hours:minute:seconds
        return parts[0] * 60 * 60 * 24 + parts[1] * 60 * 60 + parts[2] * 60 + parts[3];
    }
    exports.DHMStoSeconds = DHMStoSeconds;
    /**
     * Convert seconds to DHMS
     *
     * @param {number} seconds
     * @returns {string}
     */
    function secondsToDHMS(seconds, minimalPlaces = 1) {
        // TODO - fix this rushed math
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds - days * 86400) / 3600);
        const minutes = Math.floor((seconds % (60 * 60)) / 60);
        const parts = [days, hours, minutes, Math.floor(seconds % 60)];
        while (!parts[0] && parts.length > minimalPlaces)
            parts.shift();
        return parts.map(num => num.toString().padStart(2, '0')).join(':');
    }
    exports.secondsToDHMS = secondsToDHMS;
    /**
     * Track the delay of a promise
     *
     * @param {Promise<T>} promise promise to track delay of
     * @returns {{ delay: number, response: T }}
     */
    async function trackDelay(promise) {
        const requested = Date.now();
        const response = await promise();
        return { delay: Date.now() - requested, response };
    }
    exports.trackDelay = trackDelay;
    function attachEscapeHandler(action, check = () => true) {
        const handler = (e) => {
            if (e.key !== 'Escape' || !check())
                return;
            // Stop other escape handlers from being triggered
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            window.removeEventListener('keydown', handler);
            return action();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }
    exports.attachEscapeHandler = attachEscapeHandler;
    async function loadFromLocalStorage() {
        return JSON.parse(localStorage.getItem('r2_twitch_user_markers_' + (await (0, twitch_2.getVideoID)(false))) ??
            '{"formatter": "json", "content": "[]"}');
    }
    exports.loadFromLocalStorage = loadFromLocalStorage;
    async function saveToLocalStorage(formatter, markers) {
        localStorage.setItem('r2_twitch_user_markers_' + (await (0, twitch_2.getVideoID)(false)), JSON.stringify({
            formatter,
            content: formatters_1.FORMATTERS[formatter].serializeAll(markers),
        }));
    }
    exports.saveToLocalStorage = saveToLocalStorage;
    function createUninstaller(reinstall, shouldReinstall) {
        const uninstallFuncs = [
            (function reinstallOnChange(shouldReinstall = () => false) {
                const url = window.location.href;
                const interval = setInterval(() => {
                    if (shouldReinstall() || window.location.href !== url) {
                        clearInterval(interval);
                        uninstall().then(reinstall);
                    }
                }, 1000);
                return () => clearInterval(interval);
            })(shouldReinstall),
        ];
        async function uninstall() {
            log('Uninstalling...');
            for (const func of uninstallFuncs)
                await func();
            log('Uninstalled');
        }
        window.r2_twitch_user_markers = { uninstall };
        function addUninstallationStep(step) {
            uninstallFuncs.push(step);
        }
        return addUninstallationStep;
    }
    exports.createUninstaller = createUninstaller;
});
define("formatters", ["require", "exports", "helpers"], function (require, exports, helpers_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getUIFormatter = exports.FORMATTERS = void 0;
    class MarkerFormatter {
        static multiline = false;
        static delim = '\n';
        static *serialize(_) {
            return [];
        }
        static *deserialize(_) {
            return [];
        }
        static serializeAll(markers) {
            return Array.from(this.serialize(markers)).join(this.delim);
        }
        static deserializeAll(content) {
            return Array.from(this.deserialize(content));
        }
        static serializeSeconds(seconds) {
            return seconds;
        }
        static deserializeSeconds(serializedSeconds) {
            return Number(serializedSeconds);
        }
        static serializeName(name) {
            return name;
        }
        static deserializeName(serializedName) {
            return serializedName;
        }
    }
    exports.FORMATTERS = {
        json: class JSONFormatter extends MarkerFormatter {
            static serializeAll(markers) {
                return JSON.stringify(markers);
            }
            static deserializeAll(content) {
                return JSON.parse(content);
            }
        },
        minimal: class MinimalFormatter extends MarkerFormatter {
            static delim = '\n';
            static *serialize(markers) {
                const places = (0, helpers_3.secondsToDHMS)(markers[markers.length - 1]?.seconds ?? 0).split(':').length;
                for (const marker of markers) {
                    const dhms = (0, helpers_3.secondsToDHMS)(marker.seconds, places);
                    yield [dhms, marker.name].join('\t');
                }
            }
            static *deserialize(content) {
                for (const line of content
                    .trim()
                    .split('\n')
                    .map(line => line.trim())
                    .filter(Boolean)) {
                    const [dhms, ...otherWords] = line.split(/\s/);
                    const seconds = (0, helpers_3.DHMStoSeconds)(dhms.split(':').map(Number));
                    const name = otherWords.join(' ');
                    yield { name, seconds };
                }
            }
            static deserializeAll(content) {
                return Array.from(this.deserialize(content));
            }
            static serializeSeconds(seconds) {
                return (0, helpers_3.secondsToDHMS)(seconds);
            }
            static deserializeSeconds(serializedSeconds) {
                return (0, helpers_3.DHMStoSeconds)(serializedSeconds.split(':').map(Number));
            }
        },
    };
    function getUIFormatter() {
        return exports.FORMATTERS[localStorage.getItem('r2_twitch_user_markers_ui_formatter') ??
            'minimal'];
    }
    exports.getUIFormatter = getUIFormatter;
});
// ==UserScript==
// @name     R2 Twitch User-Markers
// @version  1
// @grant    none
// @match    https://www.twitch.tv/*
// @require  https://requirejs.org/docs/release/2.3.6/comments/require.js
// ==/UserScript==
define("script", ["require", "exports", "formatters", "helpers", "twitch", "ui"], function (require, exports, formatters_2, helpers_4, twitch_3, ui_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    (0, helpers_4.log)('Script Started');
    const TOP_BAR_SELECTOR = '[class="channel-info-content"] [class*="metadata-layout__"]';
    (async function main() {
        // Run uninstall if previously loaded, development only
        await window.r2_twitch_user_markers?.uninstall();
        (0, helpers_4.log)('Setup Started');
        while (document.readyState !== 'complete') {
            await (0, helpers_4.delay)(1000);
            (0, helpers_4.log)('Waiting for complete document...');
        }
        const shouldActivate = (0, twitch_3.isVOD)() || (0, twitch_3.isLive)();
        const addUninstallationStep = (0, helpers_4.createUninstaller)(main, shouldActivate ? undefined : () => (0, twitch_3.isVOD)() || (0, twitch_3.isLive)());
        addUninstallationStep(twitch_3.clearIDsCache);
        if (!shouldActivate) {
            (0, helpers_4.log)(`Not Activating - VOD: ${(0, twitch_3.isVOD)()}; Live: ${(0, twitch_3.isLive)()}`);
            return;
        }
        // Get last segment of URL, which is the video ID
        const markers = await (async () => {
            const { formatter, content } = await (0, helpers_4.loadFromLocalStorage)();
            if (!(formatter in formatters_2.FORMATTERS)) {
                (0, ui_2.dialog)('alert', `Formatter for saved content does not exist: ${formatter}`);
                return null;
            }
            return formatters_2.FORMATTERS[formatter].deserializeAll(content);
        })();
        if (markers === null) {
            (0, helpers_4.log)('Error loading markers, abandoning');
            return;
        }
        while (true) {
            await (0, helpers_4.delay)(1000);
            if (!document.querySelector('[data-a-target="player-volume-slider"]')) {
                (0, helpers_4.log)('Waiting for Volume...');
                continue;
            }
            if (!document.querySelector(TOP_BAR_SELECTOR)) {
                (0, helpers_4.log)('Waiting for Video Info Bar...');
                continue;
            }
            if (document.querySelector('[data-a-target="video-ad-countdown"]')) {
                (0, helpers_4.log)('Waiting for Advertisement...');
                await (0, helpers_4.delay)(5000);
                continue;
            }
            if ((0, twitch_3.isLive)())
                break;
            if ((0, twitch_3.isVOD)() && document.querySelector('.seekbar-bar'))
                break;
            (0, helpers_4.log)('Waiting for player...');
        }
        addUninstallationStep((() => {
            const ui = document.createElement('details');
            ui.className = 'r2_markers_ui';
            ui.style.margin = '0.5em';
            ui.style.padding = '0.5em';
            ui.style.border = '1px solid white';
            const summary = document.createElement('summary');
            summary.textContent = 'R2 Markers';
            ui.appendChild(summary);
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.gap = '0.5em';
            ui.appendChild(wrapper);
            const markersButton = document.createElement('button');
            markersButton.textContent = 'Menu';
            markersButton.className = (0, twitch_3.getButtonClass)();
            markersButton.style.flex = '1';
            markersButton.addEventListener('click', () => menu());
            wrapper.appendChild(markersButton);
            const addMarker = document.createElement('button');
            addMarker.textContent = 'Add';
            addMarker.className = (0, twitch_3.getButtonClass)();
            addMarker.style.flex = '1';
            addMarker.addEventListener('click', () => addMarkerHere());
            wrapper.appendChild(addMarker);
            document.querySelector(TOP_BAR_SELECTOR + ' > div:last-of-type').appendChild(ui);
            return () => ui.remove();
        })());
        /**
         * Get X and Y of the seconds provided
         *
         * @param {number} seconds
         * @returns {{ x: number, y: number, minX: number, maxX: number }}
         */
        function getTimeXY(seconds) {
            const bar = document.querySelector('.seekbar-bar');
            const rect = bar.getBoundingClientRect();
            const minX = rect.left;
            const maxX = rect.right;
            const duration = Number(document.querySelector('[data-a-target="player-seekbar-duration"]').dataset
                .aValue);
            const percentage = seconds / duration;
            const x = (maxX - minX) * percentage;
            const y = (rect.bottom + rect.top) / 2;
            return { x, y, minX, maxX };
        }
        /**
         * Set time to the seconds provided
         *
         * @param {number} seconds
         */
        async function setTime(seconds) {
            const bar = document.querySelector('[data-a-target="player-seekbar"]');
            Object.entries(bar.parentNode)
                .find(([key]) => key.startsWith('__reactEventHandlers'))[1]
                .children[2].props.onThumbLocationChange(seconds);
        }
        function seekToMarker(marker, e) {
            // Stop native seekbar behavior
            e?.stopImmediatePropagation();
            e?.stopPropagation();
            return setTime(marker.seconds);
        }
        function startEditingMarker(marker, seconds, name, e) {
            // Disable context menu
            e?.preventDefault();
            // Stop native seekbar behavior
            e?.stopImmediatePropagation();
            e?.stopPropagation();
            if (seconds && name)
                return editMarker(marker);
            else if (seconds)
                return editMarkerSeconds(marker);
            return editMarkerName(marker);
        }
        async function editMarkerSeconds(marker) {
            const formatter = (0, formatters_2.getUIFormatter)();
            const response = await (0, ui_2.dialog)('prompt', 'Edit Time:', () => [
                formatter.multiline ? 'textarea' : 'input',
                formatter.serializeSeconds(marker.seconds),
            ]);
            if (response === null)
                return;
            const seconds = formatter.deserializeSeconds(response);
            if (!seconds)
                return;
            marker.seconds = seconds;
            return handleMarkerUpdate();
        }
        async function editMarkerName(marker) {
            const formatter = (0, formatters_2.getUIFormatter)();
            const response = await (0, ui_2.dialog)('prompt', 'Edit Name:', () => [
                formatter.multiline ? 'textarea' : 'input',
                formatter.serializeName(marker.name),
            ]);
            if (response === null)
                return;
            const name = formatter.deserializeName(response);
            if (!name)
                return;
            marker.name = name;
            return handleMarkerUpdate();
        }
        async function editMarker(marker) {
            const formatter = (0, formatters_2.getUIFormatter)();
            const response = await (0, ui_2.dialog)('prompt', 'Edit Marker:', () => [
                formatter.multiline ? 'textarea' : 'input',
                formatter.serializeAll([marker])[0],
            ]);
            if (response === null)
                return;
            const edited = formatter.deserializeAll(response)[0];
            if (!edited)
                return;
            Object.assign(marker, edited);
            return handleMarkerUpdate();
        }
        async function editAllMarkers() {
            const formatter = (0, formatters_2.getUIFormatter)();
            const response = await (0, ui_2.dialog)('prompt', 'Edit Serialized Markers', () => [
                'textarea',
                formatter.serializeAll(markers),
            ]);
            if (response === null)
                return;
            markers.splice(0, markers.length, ...formatter.deserializeAll(response));
            return handleMarkerUpdate();
        }
        /**
         * Get the current time in seconds of the player
         *
         * @returns {number}
         */
        let getCurrentTimeLive = async () => 0;
        let markerChangeHandlers = [
            () => (0, helpers_4.loadFromLocalStorage)().then(({ formatter }) => (0, helpers_4.saveToLocalStorage)(formatter, markers)),
        ];
        addUninstallationStep((() => {
            const markerName = document.createElement('anchor');
            markerName.href = '#';
            markerName.style.cursor = 'hover';
            markerName.style.paddingLeft = '1em';
            markerName.className = 'r2_current_marker';
            markerName.dataset.controlled = '';
            if ((0, twitch_3.isVOD)()) {
                markerName.style.cursor = 'pointer';
                markerName.addEventListener('click', e => {
                    // Prevent anchor behavior
                    e.preventDefault();
                    setTime(Number(markerName.dataset.seconds));
                });
            }
            markerName.addEventListener('contextmenu', e => {
                // Stop context menu
                e.preventDefault();
                markerList.setMarkerList(true);
            });
            document
                .querySelector('[data-a-target="player-volume-slider"]')
                .parentNode.parentNode.parentNode.parentNode.appendChild(markerName);
            const markerTitleInterval = setInterval(async () => {
                if (markerName.dataset.controlled)
                    return;
                let marker;
                if ((0, twitch_3.isVOD)()) {
                    const now = await getCurrentTimeLive();
                    marker = markers.filter(m => Math.floor(m.seconds) <= now).slice(-1)[0];
                }
                else {
                    marker = markers[markers.length - 1];
                }
                if (!marker)
                    marker = {
                        name: '',
                        seconds: -1,
                    };
                markerName.textContent = marker.name;
                markerName.dataset.seconds = marker.seconds.toString();
            }, 1000);
            return () => {
                clearInterval(markerTitleInterval);
                markerName.remove();
            };
        })());
        if ((0, twitch_3.isVOD)()) {
            addUninstallationStep((() => {
                const xToSeconds = (x) => {
                    const rect = bar.getBoundingClientRect();
                    const percentage = x / rect.width;
                    const duration = Number(document.querySelector('[data-a-target="player-seekbar-duration"]')
                        .dataset.aValue);
                    const seconds = duration * percentage;
                    return seconds;
                };
                const handleMouseOver = (e) => {
                    if (e.target === bar)
                        return;
                    const markerName = document.querySelector('.r2_current_marker');
                    markerName.dataset.controlled = 'true';
                    // @ts-ignore
                    const seconds = xToSeconds(e.layerX);
                    const marker = markers.filter(m => Math.floor(m.seconds) <= seconds).slice(-1)[0] ?? null;
                    if (!marker || markerName.dataset.seconds === marker.seconds.toString())
                        return;
                    markerName.textContent = marker.name;
                    markerName.dataset.seconds = marker.seconds.toString();
                };
                const handleMouseLeave = () => {
                    document.querySelector('.r2_current_marker').dataset.controlled = '';
                };
                const bar = document.querySelector('.seekbar-bar').parentNode;
                bar.addEventListener('mouseover', handleMouseOver);
                bar.addEventListener('mouseleave', handleMouseLeave);
                return () => {
                    bar.removeEventListener('mouseover', handleMouseOver);
                    bar.removeEventListener('mouseleave', handleMouseLeave);
                };
            })());
            addUninstallationStep((() => {
                const handleWheel = async (e) => {
                    e.preventDefault();
                    const change = Math.min(Math.max(e.deltaY, -1), 1);
                    await setTime((await getCurrentTimeLive()) + change);
                };
                const bar = document.querySelector('.seekbar-bar').parentNode;
                bar.addEventListener('wheel', handleWheel);
                return () => {
                    bar.removeEventListener('wheel', handleWheel);
                };
            })());
            /**
             * Remove marker DOM elements, done before rendering and uninstall
             */
            const removeDOMMarkers = () => {
                document.querySelectorAll('.r2_marker').forEach(e => e.remove());
            };
            markerChangeHandlers.push(function renderMarkers() {
                removeDOMMarkers();
                const bar = document.querySelector('.seekbar-bar');
                for (const marker of markers) {
                    const node = document.createElement('button');
                    node.className = 'r2_marker';
                    node.title = marker.name;
                    node.style.position = 'absolute';
                    node.style.width = '1.75px';
                    node.style.height = '10px';
                    node.style.backgroundColor = 'black';
                    node.style.left = getTimeXY(marker.seconds).x + 'px';
                    node.addEventListener('click', seekToMarker.bind(null, marker));
                    node.addEventListener('contextmenu', startEditingMarker.bind(null, marker, true, true));
                    bar.appendChild(node);
                }
            });
            // Pull current time from DHMS display, it's always accurate in VODs
            getCurrentTimeLive = async () => (0, helpers_4.DHMStoSeconds)(document
                .querySelector('[data-a-target="player-seekbar-current-time"]')
                .textContent.split(':')
                .map(Number));
            addUninstallationStep(removeDOMMarkers);
        }
        else if ((0, twitch_3.isLive)()) {
            let cachedDelay = [0, 0];
            /**
             * Return the number of seconds of delay as reported by Twitch
             *
             * @returns {number}
             */
            async function getLiveDelay() {
                const now = Date.now();
                if (now - cachedDelay[0] < 60000)
                    return Promise.resolve(cachedDelay[1]);
                const latency = document.querySelector('[aria-label="Latency To Broadcaster"]');
                const bufferSize = document.querySelector('[aria-label="Buffer Size"]');
                if (!latency || !bufferSize) {
                    // Settings Gear -> Advanced -> Video Stats Toggle
                    await (0, helpers_4.clickNodes)('[data-a-target="player-settings-button"]', '[data-a-target="player-settings-menu-item-advanced"]', '[data-a-target="player-settings-submenu-advanced-video-stats"] input');
                    return getLiveDelay();
                }
                // Video Stats Toggle -> Settings Gear
                (0, helpers_4.clickNodes)('[data-a-target="player-settings-submenu-advanced-video-stats"] input', '[data-a-target="player-settings-button"]');
                const delay = [latency, bufferSize]
                    .map(e => Number(e.textContent.split(' ')[0]))
                    .reduce((sum, s) => sum + s);
                cachedDelay = [now, delay];
                return delay;
            }
            getCurrentTimeLive = async () => {
                const { delay, response: secondsDelay } = await (0, helpers_4.trackDelay)(async () => getLiveDelay());
                const currentTime = (0, helpers_4.DHMStoSeconds)(document.querySelector('.live-time').textContent.split(':').map(Number));
                const actualTime = currentTime - secondsDelay - delay / 1000;
                return actualTime;
            };
        }
        const markerList = (0, ui_2.generateMarkerList)(markers, getCurrentTimeLive, handleMarkerUpdate, setTime, startEditingMarker, seekToMarker);
        addUninstallationStep(markerList.uninstallMarkerList);
        markerChangeHandlers.push(markerList.renderMarkerList);
        async function handleMarkerUpdate() {
            for (const func of markerChangeHandlers)
                await func();
        }
        const writeToClipboard = (text) => {
            return navigator.clipboard.writeText(text).then(() => {
                window.r2_clipboard = text;
            });
        };
        /**
         * Add marker to current time
         */
        const addMarkerHere = async () => {
            let seconds = await getCurrentTimeLive();
            let name = await (0, ui_2.dialog)('prompt', 'Marker Name');
            if (!name)
                return;
            if (['t+', 't-'].some(cmd => name.toLowerCase().startsWith(cmd))) {
                const direction = name[1] === '+' ? 1 : -1;
                const offset = parseInt(name.substring(2));
                if (!isNaN(offset))
                    seconds += offset * direction;
                name = name.substring(2 + offset.toString().length).trim();
            }
            markers.push({ seconds, name });
            if ((0, twitch_3.isLive)())
                writeToClipboard(`https://twitch.tv/videos/${await (0, twitch_3.getVideoID)(false)}?t=${(0, twitch_3.generateTwitchTimestamp)(seconds)}`);
            return handleMarkerUpdate();
        };
        /**
         * Export markers objects into serialized format
         */
        const exportSerialized = async () => {
            await writeToClipboard((0, formatters_2.getUIFormatter)().serializeAll(markers));
            return (0, ui_2.dialog)('alert', 'Exported to Clipboard!');
        };
        /**
         * Menu for importing or exporting
         */
        const menu = async () => {
            const choice = await (0, ui_2.dialog)('choose', 'R2 Twitch User-Markers', () => ({
                Export: 'x',
                Edit: 'e',
                List: 'l',
            }));
            if (!choice)
                return;
            else if (choice === 'x')
                return exportSerialized();
            else if (choice === 'e')
                return editAllMarkers();
            else if (choice === 'l')
                return markerList.setMarkerList(true);
        };
        /**
         * Handle keyboard shortcuts
         *
         * @param {KeyboardEvent} e
         */
        const keydownHandler = (e) => {
            const target = e.target;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.getAttribute('role') === 'textbox')
                return;
            if (e.key === 'u')
                menu();
            if (e.key === 'b')
                addMarkerHere();
        };
        window.addEventListener('keydown', keydownHandler);
        addUninstallationStep(() => window.removeEventListener('keydown', keydownHandler));
        const resizeObserver = new ResizeObserver(handleMarkerUpdate);
        resizeObserver.observe(document.querySelector('video'));
        addUninstallationStep(() => resizeObserver.unobserve(document.querySelector('video')));
        if (markers.length)
            await handleMarkerUpdate();
        (0, helpers_4.log)('Setup Ended');
    })();
    (0, helpers_4.log)('Script Ended');
});


require(['script']);
