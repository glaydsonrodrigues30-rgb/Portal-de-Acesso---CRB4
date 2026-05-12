import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "@/firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Validation check as per instructions
async function testConnection() {
  try {
    // Attempting to read a dummy document to verify connectivity
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

testConnection();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export async function logAuditoria(acao: 'CRIACAO' | 'EDICAO' | 'EXCLUSAO' | 'IMPORTACAO', modulo: string, entidadeId: string, alteracoes: any = {}) {
  try {
    const savedSession = localStorage.getItem('crb4_session');
    if (!savedSession) return;
    const { uid, email, username } = JSON.parse(savedSession);
    
    await addDoc(collection(db, "auditoria"), {
      userId: uid,
      userEmail: email || 'N/A',
      userName: username || 'Sistema',
      acao,
      modulo,
      entidadeId,
      alteracoes,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("Erro ao registrar auditoria:", error);
  }
}
