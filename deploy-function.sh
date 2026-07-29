#!/bin/bash

# Supabase Edge Function 上传脚本
# 需要先获取 Access Token：https://supabase.com/dashboard/account/tokens

PROJECT_REF="你的项目ID"  # 从 Supabase Dashboard → Settings → General → Reference ID
ACCESS_TOKEN="你的Access Token"  # 从 https://supabase.com/dashboard/account/tokens 生成

FUNCTION_NAME="wecom-reminders"
FUNCTION_PATH="supabase/functions/${FUNCTION_NAME}/index.ts"

echo "上传 ${FUNCTION_NAME} 到 Supabase..."

curl -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${FUNCTION_NAME}/deploy" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"slug\": \"${FUNCTION_NAME}\",
    \"body\": $(cat ${FUNCTION_PATH} | jq -Rs .)
  }"

echo -e "\n部署完成！"
