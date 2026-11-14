import { useNavigate } from "react-router-dom";
import { Search, Info } from "lucide-react";
export function TrackingForm() {
  const navigate=useNavigate();
  return (
    <form
      className="tracking-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form=new FormData(e.currentTarget);
        navigate("/suivi?reference="+encodeURIComponent(String(form.get("reference")??"").trim().toUpperCase()));
      }}
    >
      <label htmlFor="reference">Référence de votre colis</label>
      <div className="tracking-input">
        <Search size={20} aria-hidden="true" />
        <input
          id="reference"
          name="reference"
          placeholder="Saisissez votre référence"
          required
          maxLength={80}
          autoComplete="off"
        />
        <button className="button" type="submit">
          Rechercher <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="form-note">
        <Info size={14} /> Un lien personnel envoyé à l’adresse enregistrée protège votre suivi.
      </p>
    </form>
  );
}
