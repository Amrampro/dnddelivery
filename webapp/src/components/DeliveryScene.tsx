import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { Store, Truck, MapPin, Check, Pause, Play } from "lucide-react";

export function DeliveryScene() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return (
    <div
      ref={ref}
      className="delivery-scene"
      data-paused={paused || !visible || !inView}
    >
      <div className="scene-art" aria-hidden="true">
        <div className="scene-halo" />
        <div className="scene-orbit scene-orbit-one" />
        <div className="scene-orbit scene-orbit-two" />
        <svg className="scene-path" viewBox="0 0 560 460" fill="none">
          <path
            d="M100 285 C80 130 365 45 458 147 S425 355 288 357 S101 369 100 285"
            stroke="#B1CFC4"
            strokeWidth="1.5"
            strokeDasharray="5 9"
          />
          <circle
            className="scene-traveller"
            cx="0"
            cy="0"
            r="5"
            fill="#078657"
          />
        </svg>
        <div className="scene-ground" />
        <div className="scene-cube">
          <svg viewBox="0 0 240 250" fill="none">
            <defs>
              <linearGradient
                id="parcel-top"
                x1="25"
                y1="40"
                x2="210"
                y2="120"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#59BF96" />
                <stop offset="1" stopColor="#1D9D72" />
              </linearGradient>
              <linearGradient
                id="parcel-left"
                x1="30"
                y1="100"
                x2="135"
                y2="230"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#169266" />
                <stop offset="1" stopColor="#06724F" />
              </linearGradient>
              <linearGradient
                id="parcel-right"
                x1="120"
                y1="130"
                x2="215"
                y2="200"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#086E50" />
                <stop offset="1" stopColor="#034632" />
              </linearGradient>
            </defs>
            <path
              d="M25 77 L120 24 L215 77 L120 132 Z"
              fill="url(#parcel-top)"
            />
            <path d="M25 77 L120 132 V238 L25 183 Z" fill="url(#parcel-left)" />
            <path
              d="M120 132 L215 77 V183 L120 238 Z"
              fill="url(#parcel-right)"
            />
            <path
              d="M72 51 L167 105 V148 L151 157 V114 L56 60 Z"
              fill="#C4E9D8"
              opacity=".8"
            />
            <path
              d="M25 77 L120 132 L215 77 M120 132 V238"
              stroke="#9EE0C0"
              strokeOpacity=".4"
            />
            <path
              d="M43 135 L91 163 V192 L43 164 Z"
              fill="white"
              fillOpacity=".94"
            />
            <path
              d="M52 150 L78 165 M52 157 L69 167"
              stroke="#0B7856"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="scene-card scene-shop">
          <span>
            <Store size={25} />
          </span>
          <div>
            <small>LE DÉPART</small>
            <strong>Votre boutique</strong>
          </div>
        </div>
        <div className="scene-card scene-driver">
          <span>
            <Truck size={28} />
          </span>
          <div>
            <small>LE MOUVEMENT</small>
            <strong>Votre équipe</strong>
          </div>
          <i>
            <Check size={12} />
          </i>
        </div>
        <div className="scene-pin">
          <MapPin size={30} />
          <span>La bonne destination.</span>
        </div>
        <span className="scene-spark spark-one" />
        <span className="scene-spark spark-two" />
        <span className="scene-spark spark-three" />
      </div>
      <button
        className="scene-toggle"
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={
          paused
            ? "Reprendre l’animation décorative"
            : "Mettre l’animation décorative en pause"
        }
      >
        {paused ? <Play size={13} /> : <Pause size={13} />}
        <span>{paused ? "Reprendre l’animation" : "Mettre en pause"}</span>
      </button>
    </div>
  );
}
