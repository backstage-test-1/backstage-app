# 🏗️ Architecture

`sth-backstage` 는 Kubernetes 클러스터 상에서 운영되는 'backstage'입니다. 즉, 지금 사용하고 계시는 backstage 플랫폼 Source 입니다.

## 시스템 구성 요소

### 1. Backstage Application
- **런타임:** Node.js 기반, Yarn workspaces를 통해 빌드
- **설정:** `app-config.yaml`을 통해 통합 설정을 관리
- **주요 기능:** Catalog, Scaffolder, TechDocs, Search, Auth (Guest).
- **접근:** 사내 인프라 VPN 접속 후 Kubernetes NodePort `30007`을 통해 외부로 노출

### 2. Software Catalog & Scaffolder
- **데이터 소스:** 로컬 파일 및 원격 GitHub 저장소(`backstage-test-1/backstage-app`)로부터 엔티티를 로드
- **GitHub 통합:** Pull Request, Issue 등의 메타데이터를 연동하며, 스캐폴더 템플릿을 통해 새로운 저장소 생성을 자동화

### 3. Database (PostgreSQL)
- **역할:** Backstage 플러그인의 데이터를 저장하는 기본 데이터 저장소
- **배포:** 독립된 Kubernetes Pod으로 배포되며, 연결 정보는 Kubernetes Secret을 통해 주입

## 통합 플러그인 연동 현황

현재 `backstage-app` 및 `backstage-manifests` 저장소와 관련하여 다음과 같은 주요 플러그인 연동이 완료되었습니다:

- **ArgoCD:** Backstage 내에서 배포 상태(Sync Status, Health)를 시각화
- **GitHub:** CI 파이프라인(GitHub Actions) 상태 및 실행 이력을 통합하여 가시화
- **Kubernetes:** 클러스터 내의 리소스(Pods, Deployments) 상태를 실시간으로 모니터링
- **Notifications & Signals:** 시스템 이벤트에 대한 실시간 알림 기능을 제공
