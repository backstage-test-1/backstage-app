# 🚢 배포 (Deployment)

이 프로젝트는 GitOps 베스트 프랙티스를 준수하여 Kubernetes manifest를 별도 레포지토리로 분리하여 Kubernetes 클러스터에 애플리케이션을 배포합니다.


> https://argo-cd.readthedocs.io/en/stable/user-guide/best_practices/
> https://docs.cloud.google.com/kubernetes-engine/config-sync/docs/concepts/gitops-best-practices?hl=ko

## GitOps Workflow

### 1. CI
- **Tool:** GitHub Actions (`build-and-deploy.yml`)
- **Process:**
    - `main` 브랜치에 푸시 발생 -> 백엔드와 프론트엔드를 빌드
    - Docker 이미지를 생성하여 `ghcr.io`에 푸시
    - 업데이트된 이미지 태그를 GitOps 전용 저장소인 `backstage-manifests`에 자동으로 커밋

### 2. CD
- **Tool:** ArgoCD
- **Process:**
    - ArgoCD는 `backstage-manifests` 저장소의 변경 사항을 실시간으로 감시
    - 변경된 이미지 태그를 감지하면 Kubernetes 클러스터의 실제 상태를 저장소의 선언적 상태와 동기화

## 설정 및 보안
- **Config 관리:** `app-config.yaml`은 CI 빌드 과정에서 Docker 이미지 내에 포함됨
- **Secrets 관리:** 데이터베이스 자격 증명, GitHub 토큰 등 민감한 정보는 Kubernetes Secret을 통해 런타임에 환경 변수로 주입
