---
name: Brevo no Replit
description: Restrição de IP do Brevo ao usar o conector gerenciado do Replit.
---

Não usar allowlist de IP na chave do Brevo ligada ao conector gerenciado do Replit, pois as chamadas podem sair por endereços diferentes.

**Why:** a mesma integração autenticada alternou entre múltiplos IPs e o Brevo respondeu 401 para cada endereço novo; após desativar a restrição, o envio transacional foi aceito e a chegada à caixa de entrada foi confirmada.

**How to apply:** se chamadas válidas do Brevo falharem com “unrecognised IP address”, verificar primeiro a restrição em Security > Authorized IPs. Manter a credencial protegida pelo conector e nunca registrá-la.