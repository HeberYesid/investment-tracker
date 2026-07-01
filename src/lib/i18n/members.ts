export const memberStrings = {
  es: {
    pageTitle: "Miembros del portafolio",
    pageDescription:
      "Invita a otros usuarios a ver o editar este portafolio. Solo tú puedes agregar o quitar miembros.",
    addMemberTitle: "Agregar miembro",
    addMemberDescription:
      "Ingresa el correo electrónico de un usuario existente. El nuevo miembro debe haber iniciado sesión al menos una vez.",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "usuario@ejemplo.com",
    roleLabel: "Rol",
    roleEditor: "Editor (puede crear, importar y modificar operaciones)",
    roleViewer: "Visualizador (solo lectura)",
    addButton: "Agregar",
    adding: "Agregando...",
    tableHeaderMember: "Miembro",
    tableHeaderRole: "Rol",
    tableHeaderActions: "Acciones",
    tableYouBadge: "Tú",
    removeButton: "Quitar",
    changeRoleButton: "Guardar",
    confirmRemove:
      "¿Estás seguro de que quieres quitar a este miembro del portafolio?",
    youCannotRemoveYourself:
      "No puedes quitarte a ti mismo. Pide a otro propietario que te elimine o transfiera la propiedad primero.",
    errorEmailNotFound:
      "No encontramos un usuario con ese correo — pídele que inicie sesión primero.",
    errorMemberExists: "Ese usuario ya es miembro del portafolio.",
    errorLoadMembers: "No se pudo cargar la lista de miembros.",
    errorLastOwner:
      "No puedes dejar el portafolio sin propietarios.",
    errorForbidden: "Solo los propietarios pueden administrar miembros.",
  },
} as const;

export type MemberStrings = (typeof memberStrings)["es"];

export function getMemberLabels(): MemberStrings {
  return memberStrings.es;
}
