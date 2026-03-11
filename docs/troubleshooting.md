# 🛠️ Troubleshooting

Backstage 운영 중 발생할 수 있는 주요 이슈와 그에 대한 해결 방안입니다.

## 1. UI 화면 빈 칸 현상 (ERR_SSL_PROTOCOL_ERROR)
- **원인:** Backstage의 CSP(Content Security Policy) 설정이 HTTPS를 강제하여 발생하는 문제입니다.
- **해결:** `app-config.yaml`에서 `backend.csp.upgrade-insecure-requests: false`로 설정하여 비활성화합니다.

## 2. PostgreSQL 연결 실패
- **원인:** 설정 파일 간의 충돌 또는 환경 변수 매핑 오류입니다.
- **해결:** `app-config.yaml` 내의 설정을 단일화하고, Kubernetes Secret으로부터 올바른 환경 변수가 전달되는지 확인합니다.

## 3. TechDocs 빌드 실패 (Docker 권한 또는 Python 모듈 누락)
- **원인:** TechDocs 생성기가 Docker를 사용하려고 하거나 Python의 `distutils` 모듈이 없는 경우입니다.
- **해결:** `techdocs.generator.runIn: 'local'`로 설정하고, Dockerfile 내에 필요한 Python 환경(`pip`, `mkdocs-techdocs-core` 등)을 직접 설치합니다.

## 4. ArgoCD 플러그인 401 Unauthorized 오류
- **원인:** `ARGOCD_URL`이 HTTP로 설정되어 리다이렉트가 발생하고, 이 과정에서 인증 헤더가 손실되는 문제입니다.
- **적용된 해결:** 현재 운영 환경은 `argocd-cmd-params-cm`에 `server.insecure: "true"`를 적용해 Argo CD의 내부 TLS를 끈 상태입니다. 따라서 Backstage의 `ARGOCD_URL`은 `http://argocd-server.argocd.svc.cluster.local`로 유지하고, ingress도 HTTP 백엔드(Service 80)에 맞춰야 합니다.
- **대안:** 나중에 Argo CD TLS를 다시 켜면 `ARGOCD_URL`도 `https`로 되돌리고 ingress도 HTTPS / Service 443 기준으로 함께 바꿔야 합니다.

## 5. 플러그인 추가 시 버전 호환성 문제
- **원인:** 새로운 플러그인을 추가할 때 기존 Backstage 코어 패키지와 버전이 일치하지 않거나, 의존성 충돌로 인해 `Invalid registration type` 등의 오류가 발생할 수 있습니다.
- **해결:** Backstage는 정기적으로 릴리스를 배포하므로, 프로젝트의 의존성을 최신 상태로 유지하는 것이 중요합니다. 루트 디렉토리에서 다음 명령어를 실행하여 모든 관련 패키지를 한 번에 업데이트할 수 있습니다.
    ```bash
    yarn backstage-cli versions:bump
    ```
    이후 `yarn install`을 실행하여 변경 사항을 적용합니다. 자세한 내용은 [Backstage 업데이트 공식 가이드](https://backstage.io/docs/getting-started/keeping-backstage-updated/)를 참고하십시오.

> 추가: [Github, ArgoCD 플러그인 통합 관련 Issue](https://github.com/backstage-test-1/backstage-app/issues/2)
