import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from './translations';

const I18nContext = createContext({
  lang: 'en',
  t: (key) => key,
  setLang: () => {},
});

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState('en');

  useEffect(() => {
    AsyncStorage.getItem('app_language').then((v) => {
      if (v && translations[v]) {
        setLangState(v);
      }
    });
  }, []);

  const setLang = useCallback((l) => {
    setLangState(l);
    AsyncStorage.setItem('app_language', l);
  }, []);

  const t = useCallback((key) => {
    return translations[lang]?.[key] ?? translations.en?.[key] ?? key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, t, setLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
