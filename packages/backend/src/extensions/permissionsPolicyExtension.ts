import { createBackendModule } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import { PermissionPolicy, PolicyQuery } from '@backstage/plugin-permission-node';
import { PolicyDecision } from '@backstage/plugin-permission-common';
import { BackstageIdentityResponse } from '@backstage/plugin-auth-node';

class CustomPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    user?: BackstageIdentityResponse,
  ): Promise<PolicyDecision> {
    // 현재 로그인된 사용자가 Guest인지 확인합니다.
    const isGuest = user?.identity.userEntityRef === 'user:default/guest';

    if (isGuest) {
      // Guest인 경우 카탈로그 생성 및 Scaffolder 템플릿 실행 권한을 거절합니다.
      if (
        request.permission.name === 'catalog.entity.create' ||
        request.permission.name === 'scaffolder.template.execute' ||
        request.permission.name === 'scaffolder.action.execute'
      ) {
        return { result: 'DENY' };
      }
    }

    // 그 외의 경우 (GitHub 등으로 로그인한 경우) 모든 권한을 허용합니다.
    return { result: 'ALLOW' };
  }
}

export const customPermissionPolicyModule = createBackendModule({
  pluginId: 'permission',
  moduleId: 'custom-policy',
  register(reg) {
    reg.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy(new CustomPermissionPolicy());
      },
    });
  },
});

export default customPermissionPolicyModule;
