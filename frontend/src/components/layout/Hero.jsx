import { Link } from 'react-router-dom';

import Icon from '../ui/Icon.jsx';
import { EMPTY } from '../../lib/format.js';

/**
 * The editorial hero.
 *
 * One page in the product gets to be a cover rather than a screen, and it is this one:
 * the overview is where someone arrives, and a dashboard that opens with six tiles tells
 * you nothing about what it is for. Everything past it stays dense.
 *
 * The photograph is decorative, so it carries no alt text and sits behind a scrim rather
 * than being relied on for contrast. Every figure in the card is passed in from live data
 * and renders as unavailable when it is missing - the hero never invents a number to look
 * better composed.
 */
export function Hero({ region, resourceCount, issueCount, labLabel, unavailable = false }) {
  return (
    <header className="hero">
      <div className="hero__image" role="presentation" />
      <div className="hero__scrim" role="presentation" />

      <div className="hero__body">
        <p className="eyebrow eyebrow--on-image">
          Live AWS environment{region ? ` · ${region}` : ''}
        </p>
        <h1 className="hero__title">
          Find the fault.
          <br />
          Fix it. Prove it.
        </h1>
        <p className="hero__lede">
          An AI cloud operations engineer that reads this account, reasons about what is wrong
          with Amazon Bedrock, applies the fix you approve, and verifies the result.
        </p>
      </div>

      <div className="hero__card">
        <div className="hero__cell hero__cell--primary">
          <p className="eyebrow">Operations overview</p>
          <p className="hero__cell-text">
            What exists, what it costs, what is wrong with it, and what is being done about it.
          </p>
        </div>

        <div className="hero__cell hero__cell--figure">
          <p className="hero__figure-label">Resources</p>
          <p className="hero__figure tabular">{unavailable ? EMPTY : (resourceCount ?? EMPTY)}</p>
        </div>

        <div className="hero__cell hero__cell--figure">
          <p className="hero__figure-label">Findings</p>
          <p className="hero__figure tabular">{unavailable ? EMPTY : (issueCount ?? EMPTY)}</p>
        </div>

        <Link className="hero__cell hero__cell--action" to="/issues">
          <span className="hero__action-label">{labLabel ?? 'Lab environment'}</span>
          <span className="hero__action-cta">
            Review findings
            <Icon name="chevron" size={14} />
          </span>
        </Link>
      </div>
    </header>
  );
}

export default Hero;
