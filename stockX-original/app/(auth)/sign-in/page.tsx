"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import InputField from "@/components/forms/InputField";
import FooterLink from "@/components/forms/FooterLink";
import {
  AppKitButton,
  AppKitConnectButton,
  AppKitAccountButton,
  AppKitNetworkButton,
} from "@reown/appkit/react";

import { useRouter } from "next/navigation";

const SignIn = () => {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormData>({
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onBlur",
  });

  const onSubmit = async (data: SignInFormData) => {
    try {
    } catch (e) {}
  };

  return (
    <>
      <h1 className="form-title">Welcome back</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <AppKitConnectButton label="Connect wallet" />
      </form>
    </>
  );
};
export default SignIn;
