{{- define "home-lab.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "home-lab.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "home-lab.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "home-lab.labels" -}}
helm.sh/chart: {{ include "home-lab.chart" . }}
{{ include "home-lab.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "home-lab.selectorLabels" -}}
app.kubernetes.io/name: {{ include "home-lab.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "home-lab.imagePullSecrets" -}}
{{- $secrets := .Values.imagePullSecrets }}
{{- if .Values.imageCredentials }}
{{- $secrets = append $secrets (dict "name" (printf "%s-registry" (include "home-lab.fullname" .))) }}
{{- end }}
{{- if $secrets }}
imagePullSecrets:
{{- range $secrets }}
  - name: {{ .name }}
{{- end }}
{{- end }}
{{- end }}
