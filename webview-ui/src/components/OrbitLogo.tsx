/**
 * The Orbit AI mark: a planet with a satellite on a tilted orbit.
 * Same shapes as resources/orbit-activity.svg, drawn in the current text color;
 * the satellite uses the accent color from the .orbit-logo-satellite CSS class.
 *
 * With `animated`, the satellite travels around the orbit (used on the welcome screen).
 */

// The tilted orbit as two arcs (rotation is in the arc command), for the satellite's path.
const ORBIT_PATH = 'M 20.66 7 A 10 4.6 -30 1 1 3.34 17 A 10 4.6 -30 1 1 20.66 7';

export const OrbitLogo = ({ size = 16, className, animated = false }: { size?: number; className?: string; animated?: boolean }) => (
    <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ display: 'block', flexShrink: 0 }}
    >
        <ellipse
            cx="12" cy="12" rx="10" ry="4.6"
            transform="rotate(-30 12 12)"
            fill="none" stroke="currentColor" strokeWidth="1.5"
        />
        <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        {animated ? (
            <circle className="orbit-logo-satellite" r="2.2">
                <animateMotion dur="9s" repeatCount="indefinite" path={ORBIT_PATH} />
            </circle>
        ) : (
            <circle className="orbit-logo-satellite" cx="18.87" cy="5.79" r="2.2" />
        )}
    </svg>
);
