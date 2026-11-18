import { login } from "../actions/auth";
import { mn } from "@/lib/i18n/mn";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login panel">
      <h2>{mn.app}</h2>
      {error && <p className="error">Утасны дугаар эсвэл нууц үг буруу байна</p>}
      <form action={login} className="stack">
        <label>
          Утасны дугаар
          <input name="phone" inputMode="tel" autoComplete="username" required />
        </label>
        <label>
          Нууц үг (жолооч бол PIN)
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit">Нэвтрэх</button>
      </form>
    </div>
  );
}
