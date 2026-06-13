export const authStrings = {
  login: {
    title: "Inicia sesión",
    subtitle: "Te enviamos un enlace mágico a tu correo para entrar.",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "tucorreo@ejemplo.com",
    submit: "Enviar enlace mágico",
    submitting: "Enviando...",
    successTitle: "Revisa tu bandeja",
    successBody:
      "Si el correo está registrado, te enviamos un enlace para iniciar sesión. El link expira en 60 minutos.",
    backToLogin: "Volver a intentar",
    genericError: "No pudimos enviar el enlace. Intenta de nuevo.",
  },
  error: {
    title: "No pudimos iniciar sesión",
    expired: "El enlace expiró o ya se usó. Solicita uno nuevo.",
    generic: "Ocurrió un error al validar tu enlace.",
    backToLogin: "Volver al inicio de sesión",
  },
  nav: {
    signIn: "Iniciar sesión",
    signOut: "Cerrar sesión",
  },
  userMenu: {
    signedInAs: "Conectado como",
  },
} as const;
