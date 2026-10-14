import { useState, type FormEvent } from "react";
import {
  DynamicWidget,
  useConnectWithOtp,
  useSocialAccounts,
  useDynamicContext,
} from "@dynamic-labs/sdk-react-core";
import Grainient from "@/components/Grainient";

const glassField =
  "border border-white/25 bg-white/10 text-white placeholder:text-white/50 backdrop-blur-md";

const ConnectPage = () => {
  const { setShowAuthFlow } = useDynamicContext();
  const { connectWithEmail, verifyOneTimePassword } = useConnectWithOtp();
  const { signInWithSocialAccount, isProcessing: socialPending } =
    useSocialAccounts();
  type SocialProvider = Parameters<typeof signInWithSocialAccount>[0];

  const [email, setEmail] = useState("");
  const [oneTimePassword, setOneTimePassword] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const requestEmailCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setErrorMessage("");
    try {
      await connectWithEmail(email.trim());
      setOtpRequested(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not send the email code.",
      );
    } finally {
      setPending(false);
    }
  };

  const verifyEmailCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setErrorMessage("");
    try {
      await verifyOneTimePassword(oneTimePassword.trim());
      setEmail("");
      setOneTimePassword("");
      setOtpRequested(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "That verification code could not be confirmed.",
      );
    } finally {
      setPending(false);
    }
  };

  const socialSignIn = async (provider: SocialProvider) => {
    setErrorMessage("");
    try {
      await signInWithSocialAccount(provider);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Social sign-in failed.",
      );
    }
  };

  const socialButtonClass = `flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-medium transition hover:bg-white/20 disabled:cursor-wait disabled:opacity-60 ${glassField}`;

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Full-bleed background */}
      <div className="absolute inset-0 z-0">
        <Grainient
          color1="#FB4F1F"
          color2="#000000"
          color3="#FB4F1F"
          timeSpeed={0.25}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 p-4 sm:p-8 lg:grid-cols-2 lg:gap-16">
        {/* Left: glass form panel */}
        <section className="w-full max-w-md justify-self-center rounded-3xl border border-white/25 bg-gradient-to-br from-white/20 via-white/10 to-white/5 px-6 py-10 text-white shadow-2xl backdrop-blur-2xl sm:px-10 lg:justify-self-start">
          <img
            src="/assets/icons/logo.jpg"
            alt="NBX"
            width={140}
            height={32}
            className="mx-auto mb-8 h-9 w-auto rounded-md"
          />

          <h1 className="text-center text-4xl font-semibold leading-tight tracking-tight">
            Sign in to NBX
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-center text-sm leading-6 text-white/70">
            Trade, swap, and track your portfolio. Connect a wallet or use your
            email.
          </p>

          {/* Social */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={socialPending}
              onClick={() => socialSignIn("google" as SocialProvider)}
              className={socialButtonClass}
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 48 48"
              >
                <path
                  fill="#FFC107"
                  d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4 6v5.1h6.5c3.8-3.5 6.1-8.6 6.1-14.8Z"
                />
                <path
                  fill="#FF3D00"
                  d="M24 44c5.5 0 10.1-1.8 13.5-4.8L31 34.1c-1.8 1.2-4.1 2-7 2-5.3 0-9.8-3.6-11.4-8.4H6v5.2A20 20 0 0 0 24 44Z"
                />
                <path
                  fill="#4CAF50"
                  d="M12.6 27.7a12 12 0 0 1 0-7.4v-5.2H6a20 20 0 0 0 0 17.8l6.6-5.2Z"
                />
                <path
                  fill="#1976D2"
                  d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6.1 29.5 4 24 4A20 20 0 0 0 6 15.1l6.6 5.2C14.2 15.6 18.7 12 24 12Z"
                />
              </svg>
              Google
            </button>
            <button
              type="button"
              disabled={socialPending}
              onClick={() => socialSignIn("apple" as SocialProvider)}
              className={socialButtonClass}
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M16.7 12.8c0-2.2 1.8-3.3 1.9-3.4a4.1 4.1 0 0 0-3.2-1.7c-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8a4.5 4.5 0 0 0-3.8 2.3c-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7 1.4 0 1.8.7 3 .7 1.2 0 2-1.1 2.8-2.3a10 10 0 0 0 1.3-2.7 4 4 0 0 1-2.7-3.8ZM14.4 6.2a4 4 0 0 0 .9-2.9 4.1 4.1 0 0 0-2.7 1.4 3.8 3.8 0 0 0-1 2.8 3.4 3.4 0 0 0 2.8-1.3Z" />
              </svg>
              Apple
            </button>
          </div>
          {/* Wallet */}
          <button
            type="button"
            onClick={() => setShowAuthFlow(true)}
            className={`${socialButtonClass} mt-6 bg-white text-black`}
          >
            Connect wallet
          </button>

          <div className="my-6 flex items-center gap-4 text-xs text-white/70">
            <span className="h-px flex-1 bg-white/25" />
            or continue with email
            <span className="h-px flex-1 bg-white/25" />
          </div>

          {/* Email / OTP */}
          <form
            className="space-y-4"
            onSubmit={otpRequested ? verifyEmailCode : requestEmailCode}
          >
            {!otpRequested ? (
              <label
                htmlFor="connect-email"
                className="block text-left text-sm font-medium"
              >
                Email address
                <input
                  id="connect-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email"
                  className={`mt-2 h-12 w-full rounded-xl px-4 text-sm font-normal outline-none focus:border-white/70 ${glassField}`}
                />
              </label>
            ) : (
              <label
                htmlFor="email-otp"
                className="block text-left text-sm font-medium"
              >
                Verification code sent to {email.trim()}
                <input
                  id="email-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={oneTimePassword}
                  onChange={(event) => setOneTimePassword(event.target.value)}
                  placeholder="Enter your code"
                  className={`mt-2 h-12 w-full rounded-xl px-4 text-sm font-normal outline-none focus:border-white/70 ${glassField}`}
                />
              </label>
            )}

            {errorMessage && (
              <p role="alert" className="text-left text-sm text-red-200">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="h-12 w-full rounded-xl bg-white text-sm font-semibold text-black shadow-lg transition hover:bg-white/90 disabled:cursor-wait disabled:opacity-60"
            >
              {pending
                ? "Please wait..."
                : otpRequested
                  ? "Verify and sign in"
                  : "Send verification code"}
            </button>

            {otpRequested && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setOtpRequested(false);
                  setOneTimePassword("");
                  setErrorMessage("");
                }}
                className="block w-full text-center text-sm text-white/70 hover:text-white"
              >
                Use a different email
              </button>
            )}
          </form>

          <p className="mt-5 text-center text-xs text-white/60">
            Email codes are limited to 3 attempts per 10 minutes.
          </p>
        </section>

        {/* Right: big words */}
        <div className="hidden self-stretch lg:flex lg:items-end lg:pb-16">
          <h2 className="text-7xl font-semibold leading-[0.95] tracking-tight text-white drop-shadow-lg xl:text-8xl">
            The Next
            <br />
            Step
          </h2>
        </div>
      </div>
    </main>
  );
};

export default ConnectPage;
