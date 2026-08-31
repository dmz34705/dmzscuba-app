function buildIntegrationScript(className, css, enhancement = '') {
  return `
    (function () {
      function installDmzAppIntegration() {
        if (document.getElementById('dmz-app-integration-styles')) return;

        document.documentElement.classList.add('dmz-native-app', '${className}');

        var style = document.createElement('style');
        style.id = 'dmz-app-integration-styles';
        style.textContent = ${JSON.stringify(css)};
        (document.head || document.documentElement).appendChild(style);

        ${enhancement}
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installDmzAppIntegration, { once: true });
      } else {
        installDmzAppIntegration();
      }
    })();
    true;
  `;
}

const COLOR_LOSS_CSS = `
  html.dmz-app-color,
  html.dmz-app-color body {
    height: 100%;
    width: 100%;
    overflow: hidden !important;
  }

  html.dmz-app-color body {
    margin: 0 !important;
    padding: 0 !important;
  }

  html.dmz-app-color .page {
    height: 100dvh !important;
    max-width: none !important;
    margin: 0 !important;
    width: 100% !important;
  }

  html.dmz-app-color .scene {
    border: 0 !important;
    border-radius: 0 !important;
    height: 100dvh !important;
    min-height: 100dvh !important;
  }

  @media (max-width: 1080px) {
    html.dmz-app-color .mobile-overlay {
      bottom: 6px !important;
      grid-template-columns: minmax(0, 1fr) 54px !important;
      left: 6px !important;
      right: 6px !important;
      top: 68px !important;
    }

    html.dmz-app-color .mobile-tool-row {
      gap: 3px !important;
      margin-top: 4px !important;
    }

    html.dmz-app-color .mob-btn {
      border-radius: 9px !important;
      min-height: 33px !important;
      padding: 2px !important;
    }

    html.dmz-app-color .mob-btn .sym {
      font-size: 0.82rem !important;
    }

    html.dmz-app-color .mob-btn .lab {
      font-size: 0.47rem !important;
    }

    html.dmz-app-color .mobile-depth {
      left: 0 !important;
      padding: 0.3rem 0.36rem !important;
      right: 62px !important;
    }

    html.dmz-app-color .mobile-depth-btn {
      height: 28px !important;
      width: 28px !important;
    }

    html.dmz-app-color .diver {
      width: min(200px, 50vw) !important;
    }

    html.dmz-app-color .hud {
      left: 6px !important;
      right: 6px !important;
      top: 5px !important;
    }

    html.dmz-app-color .scene-meta {
      right: 6px !important;
      top: 50px !important;
    }
  }
`;

const BOYLES_CSS = `
  html.dmz-app-boyles,
  html.dmz-app-boyles body,
  html.dmz-app-boyles #boylesDemo {
    height: 100%;
    width: 100%;
    overflow: hidden !important;
  }

  html.dmz-app-boyles body,
  html.dmz-app-boyles #boylesDemo,
  html.dmz-app-boyles #boylesDemo .page {
    margin: 0 !important;
    padding: 0 !important;
  }

  @media (max-width: 900px) {
    html.dmz-app-boyles #boylesDemo,
    html.dmz-app-boyles #boylesDemo .page,
    html.dmz-app-boyles #boylesDemo .scene-wrap {
      height: 100dvh !important;
      min-height: 100dvh !important;
    }

    html.dmz-app-boyles #boylesDemo .scene-wrap {
      border: 0 !important;
      border-radius: 0 !important;
    }

    html.dmz-app-boyles #boylesDemo .mobile-overlay {
      bottom: 6px !important;
      left: 6px !important;
      right: 6px !important;
      top: 6px !important;
    }

    html.dmz-app-boyles #boylesDemo .mobile-action-dock {
      gap: 3px !important;
      width: 54px !important;
    }

    html.dmz-app-boyles #boylesDemo .mob-float-btn {
      border-radius: 10px !important;
      min-height: 38px !important;
      padding: 2px !important;
    }

    html.dmz-app-boyles #boylesDemo .mob-float-btn .sym {
      font-size: 0.86rem !important;
    }

    html.dmz-app-boyles #boylesDemo .mob-float-btn .lab {
      font-size: 0.49rem !important;
    }

    html.dmz-app-boyles #boylesDemo .why-matters-card {
      display: none !important;
    }

    html.dmz-app-boyles #boylesDemo .mobile-coach-bar {
      background: rgba(4, 20, 35, 0.88) !important;
      border: 1px solid rgba(177, 228, 255, 0.34) !important;
      border-radius: 11px !important;
      display: grid !important;
      gap: 4px !important;
      left: 0 !important;
      padding: 7px 9px !important;
      pointer-events: none !important;
      position: absolute !important;
      right: 62px !important;
      top: 0 !important;
      z-index: 31 !important;
    }

    html.dmz-app-boyles #boylesDemo .mobile-objective {
      color: #f1fbff !important;
      display: block !important;
      font-size: 0.73rem !important;
      font-weight: 700 !important;
      line-height: 1.25 !important;
      margin: 0 !important;
    }

    html.dmz-app-boyles #boylesDemo #dmzAppActionHint {
      align-items: center;
      background: rgba(6, 28, 47, 0.92);
      border: 1px solid rgba(128, 224, 255, 0.66);
      border-radius: 999px;
      color: #eafaff;
      display: flex;
      font-size: 0.66rem;
      font-weight: 900;
      justify-content: center;
      left: 0;
      letter-spacing: 0.045em;
      min-height: 28px;
      padding: 5px 10px;
      pointer-events: none;
      position: absolute;
      right: 62px;
      text-align: center;
      text-transform: uppercase;
      top: 76px;
      z-index: 32;
    }

    html.dmz-app-boyles #boylesDemo #dmzAppActionHint[hidden],
    html.dmz-app-boyles #boylesDemo.start-card-open .mobile-coach-bar,
    html.dmz-app-boyles #boylesDemo.start-card-open #dmzAppActionHint {
      display: none !important;
    }

    html.dmz-app-boyles.dmz-app-target-depth #mobDepthSlider {
      filter: drop-shadow(0 0 7px rgba(255, 203, 105, 0.92));
    }

    html.dmz-app-boyles.dmz-app-target-inflate #mobContextAction {
      animation: dmzAppCtaPulse 0.82s ease-in-out infinite !important;
      background: #ffbd59 !important;
      border-color: #fff0ba !important;
      color: #092033 !important;
    }

    html.dmz-app-boyles.dmz-app-target-inflate #mobContextAction .lab {
      color: #092033 !important;
      font-weight: 900 !important;
    }

    html.dmz-app-boyles #boylesDemo .mobile-depth {
      border-radius: 10px !important;
      padding: 0.27rem 0.38rem !important;
    }

    html.dmz-app-boyles #boylesDemo .mobile-depth-text {
      font-size: 0.64rem !important;
    }
  }

  @keyframes dmzAppCtaPulse {
    0%, 100% { box-shadow: 0 0 0 2px rgba(255, 232, 169, 0.95), 0 0 0 5px rgba(255, 189, 89, 0.24), 0 0 14px rgba(255, 189, 89, 0.5); transform: scale(1); }
    50% { box-shadow: 0 0 0 3px rgba(255, 244, 210, 1), 0 0 0 9px rgba(255, 189, 89, 0.18), 0 0 24px rgba(255, 189, 89, 0.72); transform: scale(1.045); }
  }
`;

const BOYLES_ENHANCEMENT = `
  var overlay = document.querySelector('#boylesDemo .mobile-overlay');
  if (overlay) {
    var actionHint = document.createElement('div');
    actionHint.id = 'dmzAppActionHint';
    actionHint.setAttribute('aria-live', 'polite');
    actionHint.setAttribute('role', 'status');
    actionHint.hidden = true;
    overlay.appendChild(actionHint);

    function updateDmzAppLessonGuidance() {
      var root = document.documentElement;
      var flow = document.getElementById('mobFlowStep');
      var objective = document.getElementById('mobObjectiveText');
      var depthText = document.getElementById('mobDepthText');
      var contextButton = document.getElementById('mobContextAction');
      var highlighted = document.querySelector(
        '#mobDepthSlider.lesson-action-highlight, #mobContextAction.lesson-action-highlight, #mobMode.lesson-action-highlight, #mobSheetToggle.lesson-action-highlight, #mobReset.lesson-action-highlight'
      );
      var flowText = flow ? flow.textContent : '';
      var depthMatch = depthText ? depthText.textContent.match(/([0-9]+(?:\\.[0-9]+)?)\\s*m\\b/i) : null;
      var depthMeters = depthMatch ? Number(depthMatch[1]) : 0;
      var actionText = '';
      var target = '';
      var isDeepInflateStep = /Compression Advanced/i.test(flowText) && /Step 1\\/2/i.test(flowText);

      if (isDeepInflateStep && objective) {
        if (depthMeters < 6) {
          objective.textContent = 'Step 1 of 2: move the depth slider to 6 m (20 ft) or deeper. Then you will inflate.';
          actionText = 'Step 1 · Use the depth slider ↓';
          target = 'depth';
        } else {
          objective.textContent = 'Depth reached. Step 2 of 2: tap the glowing INFLATE button on the right.';
          actionText = 'Step 2 · Tap Inflate →';
          target = 'inflate';
        }
      } else if (highlighted) {
        if (highlighted.id === 'mobDepthSlider') {
          actionText = 'Use the depth slider ↓';
          target = 'depth';
        } else if (highlighted.id === 'mobContextAction') {
          var label = contextButton && contextButton.querySelector('.lab');
          actionText = 'Tap ' + ((label && label.textContent) || 'Action') + ' →';
          target = 'inflate';
        } else if (highlighted.id === 'mobMode') {
          actionText = 'Tap Mode →';
        } else if (highlighted.id === 'mobSheetToggle') {
          actionText = 'Open Info →';
        } else if (highlighted.id === 'mobReset') {
          actionText = 'Tap Reset →';
        }
      }

      root.classList.toggle('dmz-app-target-depth', target === 'depth');
      root.classList.toggle('dmz-app-target-inflate', target === 'inflate');
      var coachBar = document.querySelector('#boylesDemo .mobile-coach-bar');
      if (coachBar) actionHint.style.top = Math.max(70, coachBar.offsetHeight + 8) + 'px';
      actionHint.textContent = actionText;
      actionHint.hidden = !actionText;
    }

    updateDmzAppLessonGuidance();
    window.setInterval(updateDmzAppLessonGuidance, 180);
  }
`;

export const COLOR_LOSS_INTEGRATION_SCRIPT = buildIntegrationScript('dmz-app-color', COLOR_LOSS_CSS);
export const BOYLES_INTEGRATION_SCRIPT = buildIntegrationScript('dmz-app-boyles', BOYLES_CSS, BOYLES_ENHANCEMENT);
