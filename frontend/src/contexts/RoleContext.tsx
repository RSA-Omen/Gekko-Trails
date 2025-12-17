import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Role = "admin" | "finance" | "cardholder" | "manager";

interface RoleContextType {
  currentRole: Role | null;
  setCurrentRole: (role: Role | null) => void;
  currentCardholderId: number | null;
  setCurrentCardholderId: (id: number | null) => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  // Load from localStorage on mount
  const [currentRole, setCurrentRoleState] = useState<Role | null>(() => {
    const saved = localStorage.getItem("mock_role");
    return (saved as Role) || null;
  });

  const [currentCardholderId, setCurrentCardholderIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem("mock_cardholder_id");
    return saved ? parseInt(saved, 10) : null;
  });

  const setCurrentRole = (role: Role | null) => {
    setCurrentRoleState(role);
    if (role) {
      localStorage.setItem("mock_role", role);
    } else {
      localStorage.removeItem("mock_role");
    }
  };

  const setCurrentCardholderId = (id: number | null) => {
    setCurrentCardholderIdState(id);
    if (id) {
      localStorage.setItem("mock_cardholder_id", id.toString());
    } else {
      localStorage.removeItem("mock_cardholder_id");
    }
  };

  return (
    <RoleContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        currentCardholderId,
        setCurrentCardholderId,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}

