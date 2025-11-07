/* ==== Polyfill for browser API (Firefox/Chrome compat) ==== */
if (typeof browser === 'undefined') {
  const w = window.chrome || window.browser || {};
  const api = new Proxy(w, {
    get(target, prop) {
      return target[prop] || target.runtime?.[prop];
    }
  });
  Object.defineProperty(window, 'browser', { value: api, writable: false });
}



/* ==== Vim Nav + Link Hinting ==== */
(() => {
    /* ---------- CONFIG ---------- */
    const HINT_KEY               = 'f';
    const HINT_CHARS             = 'abcdefghijklmnopqrstuvwxyz';
    const BG_COLOR               = 'rgba(255,255,0,0.5)';
    const TEXT_COLOR             = '#000';
    const FONT                   = 'bold 12px monospace';

    const SCROLL_LINE_COUNT      = 1;
    const SCROLL_HORIZONTAL_PIXELS = 5;


    let bindingsEnabled = true;

    /* ---------- ACTIONS (vim style) ---------- */
    const actions = [
        { keyCombination: 'h',  command: 'cmd_scrollLeft' },
        { keyCombination: 'j',  command: 'cmd_scrollLineDown' },
        { keyCombination: 'k',  command: 'cmd_scrollLineUp' },
        { keyCombination: 'l',  command: 'cmd_scrollRight' },
        { keyCombination: 'd', command: 'cmd_scrollHalfPageDown' },
        { keyCombination: 'u', command: 'cmd_scrollHalfPageUp' },
        { keyCombination: 'G',  command: 'cmd_scrollFileBottom' },
        { keyCombination: 'gg', command: 'cmd_scrollFileTop' },
        { keyCombination: 'gt', command: 'cmd_activateNextTab' },
        { keyCombination: 'gT', command: 'cmd_activatePreviousTab' },
        { keyCombination: 'yy', command: 'cmd_copyUrl' },
        { keyCombination: 'H', command: 'cmd_historyBack' },
        { keyCombination: 'L', command: 'cmd_historyForward' },

        // this, not taking from here,
        // just here to document not sure how to add ctrl,alt bindings
        { keyCombination: 'alt-i', command: 'cmd_toggleBindings' }, 
    ];

    const maxCombinationLength = actions.reduce((a, c) => Math.max(a, c.keyCombination.length), 0);
    const numbers = [...'0123456789'].map(String);
    const validKeys = new Set();
    actions.forEach(a => a
        .keyCombination
        .split('')
        .forEach(k => validKeys
            .add(k)));

    /* ---------- COMMANDS ---------- */
    const commands = {

        cmd_toggleBindings: () => {
            bindingsEnabled = !bindingsEnabled;
            if (!bindingsEnabled) hideHints(); // clean up if disabling
            console.log('Vim bindings:', bindingsEnabled ? 'ON' : 'OFF');
        },

        cmd_scrollLeft: rep => {
            const r = rep === '' ? 1 : +rep;
            document.body.scrollLeft -= SCROLL_HORIZONTAL_PIXELS * r;
        },
        cmd_scrollRight: rep => {
            const r = rep === '' ? 1 : +rep;
            document.body.scrollLeft += SCROLL_HORIZONTAL_PIXELS * r;
        },
        cmd_scrollLineDown: rep => {
            const r = rep === '' ? 1 : +rep;
            window.scrollByLines(SCROLL_LINE_COUNT * r);
        },
        cmd_scrollLineUp: rep => {
            const r = rep === '' ? 1 : +rep;
            window.scrollByLines(-SCROLL_LINE_COUNT * r);
        },

        cmd_scrollHalfPageDown: rep => {
            const r = rep === '' ? 1 : +rep;
            window.scrollBy(0, window.innerHeight * 0.5 * r);
        },
        cmd_scrollHalfPageUp: rep => {
            const r = rep === '' ? 1 : +rep;
            window.scrollBy(0, -window.innerHeight * 0.5 * r);
        },

        cmd_scrollFileBottom: () => window.scrollTo(window.scrollX, document.body.scrollHeight),
        cmd_scrollFileTop:    () => window.scrollTo(window.scrollX, 0),

        cmd_copyUrl: () => {
            const url = window.location.href;
            navigator.clipboard.writeText(url)
        },

        cmd_historyBack: rep => {
            const r = rep === '' ? 1 : +rep;
            for (let i = 0; i < r; i++) {
                history.back();
            }
        },

        cmd_historyForward: rep => {
            const r = rep === '' ? 1 : +rep;
            for (let i = 0; i < r; i++) {
                history.forward();
            }
        },

        cmd_activateNextTab: rep => browser.runtime.sendMessage({
            to: 'background',
            command: 'activateNextTab',
            repetition: rep
        }),
        cmd_activatePreviousTab: rep => browser.runtime.sendMessage({
            to: 'background',
            command: 'activatePreviousTab',
            repetition: rep
        })
    };

    /* ---------- STATE ---------- */
    let hintsActive = false; let hintBoxes   = [];
    let clickMap    = new Map();
    let typedHint   = '';
    let repetition  = '';
    let keyCombo    = '';

    /* ---------- HELPERS ---------- */
    const resetHistory = () => { repetition = ''; keyCombo = ''; typedHint = ''; };

    const isEditable = el => {
        if (!el) return false;
        const tag = el.tagName?.toUpperCase();
        const editable = el.isContentEditable;
        const form = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
        return editable || form;
    };

    /* ---------- LINK HINTING ---------- */
    const getClickableElements = () => {
        const sel = [
            'a[href]', 'button', 'input[type=submit]', 'input[type=button]',
            'input[type=image]', '[onclick]', '[role=button]', '[tabindex]:not([tabindex="-1"])'

        ].join(', ');

        return Array.from(document.querySelectorAll(sel)).filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        });
    };

    const generateCode = idx => {
        let code = '';
        let i = idx;
        while (true) {
            code = HINT_CHARS[i % HINT_CHARS.length] + code;
            i = Math.floor(i / HINT_CHARS.length) - 1;
            if (i < 0) break;
        }
        return code.toUpperCase();
    };

    const createHintDiv = (code, rect) => {
        const d = document.createElement('div');
        d.textContent = code;
        Object.assign(d.style, {
            position: 'absolute',
            left: `${window.scrollX + rect.left}px`,
            top:  `${window.scrollY + rect.top}px`,
            width: `${rect.width}px`,
            height:`${rect.height}px`,
            backgroundColor: BG_COLOR,
            color: TEXT_COLOR,
            font: FONT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: '2147483647',
            boxSizing: 'border-box',
            border: '1px solid #000',
            userSelect: 'none'
        });
        document.body.appendChild(d);
        return d;
    };

    const showHints = () => {
        if (hintsActive) return;
        hintsActive = true;
        const els = getClickableElements();
        els.forEach((el, i) => {
            const code = generateCode(i);
            const box  = createHintDiv(code, el.getBoundingClientRect());
            hintBoxes.push(box);
            clickMap.set(code, el);
        });
    };

    const hideHints = () => {
        if (!hintsActive) return;
        hintsActive = false;
        hintBoxes.forEach(b => b.remove());
        hintBoxes = [];
        clickMap.clear();
        typedHint = '';
    };

    const runVimAction = action => {
        commands[action.command](repetition);
        resetHistory();
    };

    /* ---------- EVENT LISTENER (capture phase) ---------- */
    document.addEventListener('keydown', e => {
        const key = e.key;
        const inEditable = isEditable(document.activeElement);

        //shift - i for toggling input
        if (e.altKey && e.key === 'i') {
            console.log("toggling input")
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            commands.cmd_toggleBindings();
            return;
        }
        if (!bindingsEnabled) return;

        /* ---- 1. Toggle hints with 'f' (outside inputs) ---- */ if (key.toLowerCase() === HINT_KEY && !e.ctrlKey && !e.altKey && !e.metaKey && !inEditable) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            hintsActive ? hideHints() : showHints();
            return;
        }

        /* ---- 2. Hint mode active ---- */
        if (hintsActive) { if (HINT_CHARS.includes(key.toLowerCase())) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                typedHint += key.toUpperCase();
                const candidates = [...clickMap.entries()]
                .filter(([c]) => c.startsWith(typedHint))
                .map(([, el]) => el);

                if (candidates.length === 1) {
                    hideHints();
                    setTimeout(() => candidates[0].click(), 0);
                } else if (candidates.length === 0) {
                    hideHints();
                }
                return;
            }
            if (key === 'Escape') {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                hideHints();
                return;
            }
            // any other key cancels hint mode
            hideHints();
            return;
        }

        /* ---- 3. Normal vim navigation (outside inputs) ---- */
        if (inEditable) return;               // let page handle typing

        // ---- repetition numbers ----
        if (numbers.includes(key)) {
            e.preventDefault();                 // stop page scrolling on 0-9
            repetition += key;
            return;
        }

        // ---- valid command keys only ----
        if (!validKeys.has(key)) {
            resetHistory();
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        keyCombo += key;

        const action = actions.find(a => a.keyCombination === keyCombo);
        if (action) {
            runVimAction(action);
            return;
        }

        // partial match – wait for more keys
        if (keyCombo.length >= maxCombinationLength) {
            resetHistory();   // impossible match
        }
    }, true);   // **capture phase** – runs before page scripts

    /* ---- optional keyup blocker ---- */
    document.addEventListener('keyup', e => {
        if (hintsActive || e.key.toLowerCase() === HINT_KEY || validKeys.has(e.key)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    /* ---- cleanup ---- */
    window.addEventListener('unload', () => {
        hideHints();
        resetHistory();
    });
})();
